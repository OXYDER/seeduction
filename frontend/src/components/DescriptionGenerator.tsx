import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client';
import { extractVariables } from '../lib/bbcode';

const KINDS: { value: string; label: string }[] = [
  { value: 'FILM', label: 'Film' },
  { value: 'SERIE', label: 'Série' },
  { value: 'MUSIQUE', label: 'Musique' },
  { value: 'JEU', label: 'Jeu' },
  { value: 'LOGICIEL', label: 'Logiciel' },
  { value: 'LIVRE', label: 'Livre' },
  { value: 'XXX', label: 'XXX' },
  { value: 'DOCUMENT', label: 'Document' },
  { value: 'ARCHIVE', label: 'Archive' },
  { value: 'PERSONNALISE', label: 'Personnalisé' },
];

interface Template {
  id: string;
  name: string;
  kind: string;
  content: string;
  isGlobal: boolean;
  ownerId: string | null;
}

interface SearchResult {
  id: string;
  title: string;
  subtitle: string;
  thumbnail: string | null;
}

const squash = (s: string) => s.replace(/\s+/g, '');

/**
 * Met à jour les valeurs "connues" (issues du torrent : taille, fichiers,
 * sous-titres...) sans écraser ce que l'utilisateur ou une fiche trouvée a
 * modifié : une valeur n'est remplacée que si elle est vide ou identique à
 * l'ancienne valeur connue.
 */
function syncKnown(values: Record<string, string>, prevKnown: Record<string, string>, known: Record<string, string>) {
  const next = { ...values };
  for (const [k, v] of Object.entries(known)) {
    if (next[k] === undefined || next[k] === '' || next[k] === (prevKnown[k] ?? '')) next[k] = v;
  }
  return next;
}

interface Props {
  knownValues?: Record<string, string>;
  /** Type de contenu déduit de la catégorie (facultatif : sinon Film, modifiable à la main). */
  defaultKind?: string;
  /** Titre nettoyé (sans étiquettes techniques) pour la recherche automatique. */
  searchTitle: string;
  searchYear?: string;
  /** Vrai dès qu'un fichier .torrent et une catégorie sont choisis : lance la recherche toute seule. */
  autoStart: boolean;
  /** Change quand un nouveau fichier .torrent est choisi, pour relancer la recherche automatique. */
  sessionKey: string;
  currentDescription: string;
  onGenerate: (bbcode: string) => void;
  onCoverChange?: (url: string) => void;
  /** Fiche choisie (source + identifiant) : le serveur en tire acteurs, studios, genres... à l'envoi. */
  onMetaChange?: (meta: { kind: string; id: string } | null) => void;
}

export default function DescriptionGenerator({
  knownValues = {},
  defaultKind,
  searchTitle,
  searchYear,
  autoStart,
  sessionKey,
  currentDescription,
  onGenerate,
  onCoverChange,
  onMetaChange,
}: Props) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [kind, setKind] = useState(defaultKind || 'FILM');
  const [templateId, setTemplateId] = useState('');
  const [expertMode, setExpertMode] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [content, setContent] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [saveName, setSaveName] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [supportedKinds, setSupportedKinds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchYearInput, setSearchYearInput] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [searchNote, setSearchNote] = useState('');
  const [searched, setSearched] = useState(false);
  const [progress, setProgress] = useState<{ pct: number; label: string } | null>(null);

  const searchSupported = supportedKinds.includes(kind);
  const lastGenerated = useRef('');
  const lastAuto = useRef({ session: '', kind: '' });

  useEffect(() => {
    api.get('/templates').then((r) => setTemplates(r.data)).catch(() => {});
    api.get('/metadata/kinds').then((r) => setSupportedKinds(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (defaultKind) setKind(defaultKind);
  }, [defaultKind]);

  const templatesForKind = templates.filter((t) => t.kind === kind);

  useEffect(() => {
    const first = templatesForKind[0];
    if (first && (!templateId || !templatesForKind.some((t) => t.id === templateId))) setTemplateId(first.id);
  }, [kind, templates]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const t = templates.find((t) => t.id === templateId);
    if (t) setContent(t.content);
  }, [templateId, templates]);

  const variables = useMemo(() => extractVariables(content), [content]);

  const prevKnown = useRef<Record<string, string>>({});
  const knownKey = JSON.stringify(knownValues);
  useEffect(() => {
    setValues((prev) => syncKnown(prev, prevKnown.current, knownValues));
    prevKnown.current = knownValues;
  }, [knownKey]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Recherche tolérante : si la requête exacte ne donne rien, on retire
   * d'abord le filtre d'année, puis on raccourcit le titre mot par mot
   * (les noms de fichiers torrent sont rarement le titre officiel).
   */
  async function runSearch(query: string, yearStr: string, k: string) {
    const q = query.trim();
    if (!q || !supportedKinds.includes(k)) return;
    setSearchLoading(true);
    setSearchError('');
    setSearchNote('');
    setSearchResults([]);

    const words = q.split(/\s+/);
    const attempts: { q: string; y?: string }[] = [{ q, y: yearStr || undefined }];
    if (yearStr) attempts.push({ q });
    if (words.length > 2) attempts.push({ q: words.slice(0, -1).join(' ') });
    if (words.length > 3) attempts.push({ q: words.slice(0, 2).join(' ') });

    try {
      for (let i = 0; i < attempts.length; i++) {
        const a = attempts[i];
        const { data } = await api.get('/metadata/search', { params: { kind: k, query: a.q, year: a.y } });
        if (data.length > 0) {
          setSearchResults(data);
          if (i > 0) setSearchNote(`Aucun résultat exact : recherche élargie à « ${a.q} ». Ajuste le titre ci-dessus si besoin.`);
          return;
        }
      }
    } catch (err: any) {
      setSearchError(err.response?.data?.message ?? 'Recherche indisponible');
    } finally {
      setSearched(true);
      setSearchLoading(false);
    }
  }

  // Recherche automatique : dès qu'un fichier + une catégorie sont choisis, puis quand on change de type de contenu.
  useEffect(() => {
    if (!autoStart || supportedKinds.length === 0) return;
    const newSession = lastAuto.current.session !== sessionKey;
    if (!newSession && lastAuto.current.kind === kind) return;
    lastAuto.current = { session: sessionKey, kind };

    // Nouveau fichier : on repart des infos de CE torrent (pas de synopsis/pochette de l'ancien).
    if (newSession) {
      setValues(syncKnown({}, {}, knownValues));
      prevKnown.current = knownValues;
    }

    const q = newSession || !searchQuery.trim() ? searchTitle : searchQuery;
    const y = newSession ? (searchYear ?? '') : searchYearInput;
    setSearchQuery(q);
    setSearchYearInput(y);
    setSearched(false);
    setNotice('');
    if (supportedKinds.includes(kind)) runSearch(q, y, kind);
    else setSearchResults([]);
  }, [autoStart, sessionKey, kind, supportedKinds]); // eslint-disable-line react-hooks/exhaustive-deps

  // Dès que le contenu du torrent est analysé et que la description est vide, on
  // en génère une base tout de suite (taille, liste de fichiers, sous-titres...),
  // sans attendre le choix d'un résultat de recherche.
  const baseDone = useRef('');
  useEffect(() => {
    if (!autoStart || !content || !sessionKey || baseDone.current === sessionKey) return;
    if (defaultKind && kind !== defaultKind) return;
    if (!templatesForKind.some((t) => t.id === templateId)) return;
    baseDone.current = sessionKey;
    const untouched = !currentDescription.trim() || squash(currentDescription) === squash(lastGenerated.current);
    if (!untouched) return;
    generate(syncKnown({}, {}, knownValues), true);
  }, [autoStart, content, sessionKey, kind, defaultKind, templateId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function generate(v: Record<string, string> = values, auto = false) {
    setError('');
    if (!content) {
      setError('Aucun modèle disponible pour ce type de contenu.');
      return;
    }
    const isUntouched = !currentDescription.trim() || squash(currentDescription) === squash(lastGenerated.current);
    if (!isUntouched && !window.confirm('Remplacer la description actuelle par la description générée ?')) return;

    try {
      // La pochette n'est ajoutée que si une recherche l'a effectivement fournie —
      // jamais une balise [img] vide quand le champ n'est pas rempli.
      const banner = v.affiche ? `[center][img]${v.affiche}[/img][/center]\n\n` : '';
      const { data } = await api.post('/templates/generate', { content: banner + content, values: v });
      const out = `[center]${data.bbcode}[/center]`;
      lastGenerated.current = out;
      onGenerate(out);
      setNotice(
        auto
          ? '✓ Base de description générée à partir du contenu du torrent (taille, fichiers, sous-titres...) — choisis un résultat ci-dessus pour ajouter synopsis et pochette.'
          : data.missingVariables.length > 0
          ? `✓ Description générée dans l'éditeur ci-dessous (non renseignés, donc omis : ${data.missingVariables.join(', ')}).`
          : "✓ Description générée dans l'éditeur ci-dessous — modifie-la comme tu veux.",
      );
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Erreur de génération');
    }
  }

  /**
   * La récupération d'une fiche (avec traduction) est un seul appel serveur sans
   * progression réelle : le pourcentage est estimé (il ralentit en approchant de
   * 90 %) puis complété aux étapes suivantes.
   */
  function startProgress(label: string) {
    setProgress({ pct: 3, label });
    const timer = window.setInterval(() => {
      setProgress((p) => (p && p.pct < 90 ? { ...p, pct: Math.min(90, p.pct + Math.max(0.4, (90 - p.pct) * 0.05)) } : p));
    }, 250);
    return () => window.clearInterval(timer);
  }

  async function selectResult(result: SearchResult) {
    if (searchLoading) return;
    setSearchLoading(true);
    setSearchError('');
    const stopProgress = startProgress('Récupération de la fiche, de la pochette et traduction éventuelle…');
    try {
      const { data } = await api.get('/metadata/detail', { params: { kind, id: result.id } });
      stopProgress();
      setProgress({ pct: 92, label: 'Génération de la description…' });
      const next = { ...values };
      for (const v of variables) if (next[v] === undefined) next[v] = knownValues[v] ?? '';
      for (const [k, val] of Object.entries(data)) {
        // La liste de fichiers réelle du torrent prime sur celle d'une base externe (ex : pistes Deezer).
        if (k === 'fichiers' && knownValues.fichiers) continue;
        if (typeof val === 'string' && val) next[k] = val;
      }
      setValues(next);
      if (data.affiche) onCoverChange?.(data.affiche);
      onMetaChange?.({ kind, id: result.id });
      setSearchResults([]);
      setSearchNote('');
      await generate(next);
      setProgress({ pct: 100, label: 'Terminé' });
      await new Promise((resolve) => setTimeout(resolve, 400));
    } catch (err: any) {
      setSearchError(err.response?.data?.message ?? 'Impossible de récupérer cette fiche');
    } finally {
      stopProgress();
      setProgress(null);
      setSearchLoading(false);
    }
  }

  async function saveAsTemplate() {
    if (!saveName.trim()) return;
    await api.post('/templates', { name: saveName, kind, content });
    setSaveName('');
    const { data } = await api.get('/templates');
    setTemplates(data);
  }

  const advancedVisible = showAdvanced || (supportedKinds.length > 0 && !searchSupported);

  return (
    <div className="panel ornate">
      <div className="panel-title"><span className="title-icon">✨</span>Générateur de description</div>

      <div className="grid" style={{ gap: 14 }}>
        {searchSupported ? (
          <div>
            <div className="row">
              <input
                style={{ flex: 1 }}
                placeholder="Titre à rechercher..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); setSearched(false); runSearch(searchQuery, searchYearInput, kind); } }}
              />
              <input
                style={{ width: 90 }}
                placeholder="Année"
                inputMode="numeric"
                value={searchYearInput}
                onChange={(e) => setSearchYearInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); setSearched(false); runSearch(searchQuery, searchYearInput, kind); } }}
              />
              <button type="button" className="secondary" disabled={searchLoading || !searchQuery.trim()} onClick={() => { setSearched(false); runSearch(searchQuery, searchYearInput, kind); }}>
                {searchLoading ? 'Recherche...' : '🔍 Rechercher'}
              </button>
            </div>

            {progress && (
              <div style={{ marginTop: 8 }}>
                <div className="row" style={{ justifyContent: 'space-between', fontSize: 12 }}>
                  <span className="muted">{progress.label}</span>
                  <strong style={{ color: 'var(--gold-bright)' }}>{Math.round(progress.pct)} %</strong>
                </div>
                <div style={{ height: 8, marginTop: 4, background: 'var(--bg-panel-raised)', border: '1px solid var(--border)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ width: `${progress.pct}%`, height: '100%', background: 'linear-gradient(90deg, var(--gold), var(--gold-bright))', transition: 'width 0.25s ease' }} />
                </div>
              </div>
            )}

            {searchNote && <div className="muted" style={{ marginTop: 6, color: 'var(--gold-bright)' }}>{searchNote}</div>}
            {searchError && <div className="muted" style={{ color: 'var(--danger)', marginTop: 6 }}>{searchError}</div>}
            {searched && !searchLoading && searchResults.length === 0 && !searchError && (
              <div className="muted" style={{ marginTop: 6 }}>
                Aucun résultat. Modifie le titre (ou retire l'année) puis relance la recherche, ou ouvre les options avancées pour générer sans fiche.
              </div>
            )}

            {searchResults.length > 0 && (
              <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 8, marginTop: 8 }}>
                {searchResults.map((r) => (
                  <div
                    key={r.id}
                    className="row"
                    style={{ cursor: 'pointer', gap: 8, padding: 6, border: '1px solid var(--border)', borderRadius: 6 }}
                    onClick={() => selectResult(r)}
                  >
                    {r.thumbnail
                      ? <img src={r.thumbnail} alt="" style={{ width: 44, height: 62, objectFit: 'cover', borderRadius: 3, flexShrink: 0 }} />
                      : <div style={{ width: 44, height: 62, background: 'var(--bg-panel-raised)', borderRadius: 3, flexShrink: 0 }} />}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</div>
                      <div className="muted" style={{ fontSize: 11 }}>{r.subtitle}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          supportedKinds.length > 0 && (
            <p className="muted" style={{ margin: 0 }}>
              Pas de recherche automatique pour ce type de contenu : ouvre les options avancées pour compléter les champs, ou écris directement ta description dans l'éditeur.
            </p>
          )
        )}

        {notice && <div style={{ color: 'var(--success)' }} className="muted">{notice}</div>}
        {error && <div className="muted" style={{ color: 'var(--danger)' }}>{error}</div>}

        <button type="button" className="secondary" style={{ alignSelf: 'flex-start' }} onClick={() => setShowAdvanced((v) => !v)}>
          {showAdvanced ? 'Masquer les options' : 'Options avancées (type, modèle, champs)'}
        </button>

        {advancedVisible && (
          <div className="grid" style={{ gap: 12 }}>
            <div>
              <div className="muted" style={{ marginBottom: 6 }}>Type de contenu{defaultKind ? ' (déduit de la catégorie — change-le seulement si elle est mal configurée)' : ' (déduit de la catégorie si elle est configurée)'}</div>
              <div className="category-chips" style={{ marginTop: 0 }}>
                {KINDS.map((k) => (
                  <a key={k.value} onClick={() => setKind(k.value)} style={{ cursor: 'pointer', borderColor: kind === k.value ? 'var(--gold)' : undefined }}>
                    {k.label}{supportedKinds.includes(k.value) ? ' 🔍' : ''}
                  </a>
                ))}
              </div>
            </div>

            <div>
              <div className="muted" style={{ marginBottom: 6 }}>Modèle</div>
              <select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                {templatesForKind.length === 0 && <option value="">Aucun modèle pour ce type</option>}
                {templatesForKind.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}{t.ownerId ? ' (perso)' : ''}</option>
                ))}
              </select>{' '}
              <button type="button" className="secondary" onClick={() => setExpertMode((v) => !v)}>
                {expertMode ? 'Quitter le mode expert' : 'Mode expert (éditer le modèle)'}
              </button>
            </div>

            {expertMode && (
              <textarea rows={8} value={content} onChange={(e) => setContent(e.target.value)} style={{ fontFamily: 'monospace', fontSize: 12 }} />
            )}

            {variables.length > 0 && (
              <div>
                <div className="muted" style={{ marginBottom: 6 }}>Champs du modèle</div>
                <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
                  {variables.map((v) => (
                    <input key={v} placeholder={v} value={values[v] ?? ''} onChange={(e) => setValues({ ...values, [v]: e.target.value })} />
                  ))}
                </div>
              </div>
            )}

            <div className="row" style={{ flexWrap: 'wrap' }}>
              <button type="button" onClick={() => generate()}>Générer sans choisir de résultat</button>
              <input placeholder="Nom du modèle à sauvegarder" value={saveName} onChange={(e) => setSaveName(e.target.value)} style={{ width: 220 }} />
              <button type="button" className="secondary" onClick={saveAsTemplate}>Sauvegarder comme modèle</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
