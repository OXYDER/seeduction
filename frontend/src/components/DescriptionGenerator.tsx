import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { extractVariables, bbcodeToHtml, bbcodeToMarkdown, bbcodeToText } from '../lib/bbcode';
import WysiwygEditor from './WysiwygEditor';

const KINDS: { value: string; label: string }[] = [
  { value: 'FILM', label: 'Film' },
  { value: 'SERIE', label: 'Série' },
  { value: 'MUSIQUE', label: 'Musique' },
  { value: 'JEU', label: 'Jeu' },
  { value: 'LOGICIEL', label: 'Logiciel' },
  { value: 'LIVRE', label: 'Livre' },
  { value: 'DOCUMENT', label: 'Document' },
  { value: 'ARCHIVE', label: 'Archive' },
  { value: 'PERSONNALISE', label: 'Personnalisé' },
];

const FORMATS: { value: 'bbcode' | 'markdown' | 'html' | 'text'; label: string }[] = [
  { value: 'bbcode', label: 'BBCode (éditable)' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'html', label: 'HTML' },
  { value: 'text', label: 'Texte brut' },
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

export default function DescriptionGenerator({
  knownValues = {},
  defaultKind,
  onUse,
  onCoverChange,
}: {
  knownValues?: Record<string, string>;
  defaultKind?: string;
  onUse: (text: string) => void;
  onCoverChange?: (url: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [kind, setKind] = useState(defaultKind || 'FILM');
  const [templateId, setTemplateId] = useState('');
  const [expertMode, setExpertMode] = useState(false);
  const [content, setContent] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [format, setFormat] = useState<'bbcode' | 'markdown' | 'html' | 'text'>('bbcode');
  const [editedBbcode, setEditedBbcode] = useState('');
  const [missingVariables, setMissingVariables] = useState<string[]>([]);
  const [hasGenerated, setHasGenerated] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [error, setError] = useState('');

  // --- Recherche de métadonnées (TMDB / Deezer / Google Books) ---
  const [supportedKinds, setSupportedKinds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const searchSupported = supportedKinds.includes(kind);

  useEffect(() => {
    if (open) api.get('/templates').then((r) => setTemplates(r.data));
  }, [open]);

  useEffect(() => {
    if (open) api.get('/metadata/kinds').then((r) => setSupportedKinds(r.data)).catch(() => {});
  }, [open]);

  useEffect(() => {
    if (open && !searchQuery) setSearchQuery(knownValues.titre ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (defaultKind) setKind(defaultKind);
  }, [defaultKind]);

  // Dès qu'un nom et une catégorie sont connus (fichier .torrent choisi +
  // catégorie sélectionnée), on ouvre automatiquement le générateur et sa
  // pré-recherche plutôt que d'attendre un clic — "le plus facile possible".
  useEffect(() => {
    if (!open && defaultKind && knownValues.titre?.trim()) setOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultKind, knownValues.titre]);

  async function runSearch() {
    if (!searchQuery.trim() || !searchSupported) return;
    setSearchLoading(true);
    setSearchError('');
    try {
      const { data } = await api.get('/metadata/search', { params: { kind, query: searchQuery } });
      setSearchResults(data);
    } catch (err: any) {
      setSearchError(err.response?.data?.message ?? 'Recherche indisponible');
    } finally {
      setSearchLoading(false);
    }
  }

  // Relance la recherche automatiquement quand on change de type de contenu (nouvelle source à interroger).
  useEffect(() => {
    if (open && searchSupported && searchQuery.trim()) runSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, kind, searchSupported]);

  async function selectResult(result: SearchResult) {
    setSearchLoading(true);
    setSearchError('');
    try {
      const { data } = await api.get('/metadata/detail', { params: { kind, id: result.id } });
      setValues((prev) => {
        const next = { ...prev };
        for (const [k, v] of Object.entries(data)) {
          if (typeof v === 'string' && v) next[k] = v;
        }
        return next;
      });
      if (data.affiche) onCoverChange?.(data.affiche);
      setSearchResults([]);
    } catch (err: any) {
      setSearchError(err.response?.data?.message ?? 'Impossible de récupérer cette fiche');
    } finally {
      setSearchLoading(false);
    }
  }

  const templatesForKind = templates.filter((t) => t.kind === kind);

  useEffect(() => {
    if (!open) return;
    const first = templatesForKind[0];
    if (first && (!templateId || !templatesForKind.some((t) => t.id === templateId))) {
      setTemplateId(first.id);
    }
  }, [open, kind, templates]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const t = templates.find((t) => t.id === templateId);
    if (t) setContent(t.content);
  }, [templateId, templates]);

  const variables = useMemo(() => extractVariables(content), [content]);

  useEffect(() => {
    // Pré-remplit avec ce qu'on connaît déjà (nom, taille, catégorie, résultat de recherche...), garde le reste tel quel.
    setValues((prev) => {
      const next = { ...prev };
      for (const v of variables) {
        if (next[v] === undefined) next[v] = knownValues[v] ?? '';
      }
      return next;
    });
  }, [variables]); // eslint-disable-line react-hooks/exhaustive-deps

  async function generate() {
    setError('');
    try {
      // La pochette n'est ajoutée que si une recherche l'a effectivement fournie —
      // jamais une balise [img] vide quand le champ n'est pas rempli.
      const banner = values.affiche ? `[center][img]${values.affiche}[/img][/center]\n\n` : '';
      const { data } = await api.post('/templates/generate', { content: banner + content, values });
      setEditedBbcode(data.bbcode);
      setMissingVariables(data.missingVariables);
      setHasGenerated(true);
      setFormat('bbcode');
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Erreur de génération');
    }
  }

  async function saveAsTemplate() {
    if (!saveName.trim()) return;
    await api.post('/templates', { name: saveName, kind, content });
    setSaveName('');
    const { data } = await api.get('/templates');
    setTemplates(data);
  }

  const derivedPreview = useMemo(() => {
    if (format === 'bbcode') return editedBbcode;
    if (format === 'markdown') return bbcodeToMarkdown(editedBbcode);
    if (format === 'html') return bbcodeToHtml(editedBbcode);
    return bbcodeToText(editedBbcode);
  }, [format, editedBbcode]);

  if (!open) {
    return (
      <button type="button" className="secondary" onClick={() => setOpen(true)}>
        ✨ Générer la description
      </button>
    );
  }

  return (
    <div className="panel ornate" style={{ marginTop: 8 }}>
      <div className="panel-title"><span className="title-icon">✨</span>Générateur de description</div>

      <div className="grid" style={{ gap: 14 }}>
        <div>
          <div className="muted" style={{ marginBottom: 6 }}>Type de contenu</div>
          <div className="category-chips" style={{ marginTop: 0 }}>
            {KINDS.map((k) => (
              <a key={k.value} onClick={() => setKind(k.value)} style={{ cursor: 'pointer', borderColor: kind === k.value ? 'var(--gold)' : undefined }}>
                {k.label}{supportedKinds.includes(k.value) ? ' 🔍' : ''}
              </a>
            ))}
          </div>
        </div>

        {searchSupported && (
          <div>
            <div className="muted" style={{ marginBottom: 6 }}>Rechercher (optionnel, préremplit tout automatiquement)</div>
            <div className="row">
              <input
                placeholder="Titre à rechercher..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); runSearch(); } }}
              />
              <button type="button" className="secondary" onClick={runSearch} disabled={searchLoading}>
                {searchLoading ? '...' : '🔍 Rechercher'}
              </button>
            </div>
            {searchError && <div className="muted" style={{ color: 'var(--danger)', marginTop: 4 }}>{searchError}</div>}
            {searchResults.length > 0 && (
              <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8, marginTop: 8 }}>
                {searchResults.map((r) => (
                  <div
                    key={r.id}
                    className="row"
                    style={{ cursor: 'pointer', gap: 8, padding: 6, border: '1px solid var(--border)', borderRadius: 6 }}
                    onClick={() => selectResult(r)}
                  >
                    {r.thumbnail
                      ? <img src={r.thumbnail} alt="" style={{ width: 40, height: 56, objectFit: 'cover', borderRadius: 3, flexShrink: 0 }} />
                      : <div style={{ width: 40, height: 56, background: 'var(--bg-panel-raised)', borderRadius: 3, flexShrink: 0 }} />}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</div>
                      <div className="muted" style={{ fontSize: 11 }}>{r.subtitle}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div>
          <div className="muted" style={{ marginBottom: 6 }}>Modèle</div>
          <select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            {templatesForKind.length === 0 && <option value="">Aucun modèle pour ce type</option>}
            {templatesForKind.map((t) => (
              <option key={t.id} value={t.id}>{t.name}{t.ownerId ? ' (perso)' : ''}</option>
            ))}
          </select>
          {' '}
          <button type="button" className="secondary" onClick={() => setExpertMode((v) => !v)}>
            {expertMode ? 'Quitter le mode expert' : 'Mode expert (éditer le modèle)'}
          </button>
        </div>

        {expertMode && (
          <textarea rows={8} value={content} onChange={(e) => setContent(e.target.value)} style={{ fontFamily: 'monospace', fontSize: 12 }} />
        )}

        {variables.length > 0 && (
          <div>
            <div className="muted" style={{ marginBottom: 6 }}>Compléter les champs</div>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
              {variables.map((v) => (
                <input
                  key={v}
                  placeholder={v}
                  value={values[v] ?? ''}
                  onChange={(e) => setValues({ ...values, [v]: e.target.value })}
                />
              ))}
            </div>
          </div>
        )}

        <div className="row">
          <button type="button" onClick={generate}>Générer</button>
          <input placeholder="Nom du modèle à sauvegarder" value={saveName} onChange={(e) => setSaveName(e.target.value)} style={{ width: 220 }} />
          <button type="button" className="secondary" onClick={saveAsTemplate}>Sauvegarder comme modèle</button>
        </div>

        {error && <div className="muted" style={{ color: 'var(--danger)' }}>{error}</div>}

        {hasGenerated && (
          <div>
            <div className="muted" style={{ marginBottom: 6 }}>Éditer et prévisualiser</div>
            {missingVariables.length > 0 && (
              <div className="muted" style={{ color: 'var(--gold-bright)', marginBottom: 6 }}>
                Champs vides : {missingVariables.join(', ')}
              </div>
            )}
            <div className="row" style={{ marginBottom: 8 }}>
              {FORMATS.map((f) => (
                <button key={f.value} type="button" className={format === f.value ? '' : 'secondary'} onClick={() => setFormat(f.value)}>
                  {f.label}
                </button>
              ))}
            </div>

            {/* Reste monté même quand un autre onglet est affiché (juste masqué) : un
                démontage/remontage à chaque changement d'onglet réinitialiserait le
                centrage et perdrait les éditions en cours. */}
            <div style={{ display: format === 'bbcode' ? 'block' : 'none' }}>
              <WysiwygEditor value={editedBbcode} onChange={setEditedBbcode} centerOnLoad />
            </div>
            {format !== 'bbcode' && (
              <pre style={{
                background: 'var(--bg-panel-raised)', border: '1px solid var(--border)', borderRadius: 6,
                padding: 12, maxHeight: 260, overflow: 'auto', fontSize: 12, whiteSpace: 'pre-wrap',
              }}>
                {derivedPreview}
              </pre>
            )}

            <div className="row" style={{ marginTop: 8 }}>
              <button type="button" onClick={() => onUse(editedBbcode)}>Utiliser cette description</button>
              <button type="button" className="secondary" onClick={() => navigator.clipboard.writeText(derivedPreview)}>Copier ({format})</button>
              <button type="button" className="secondary" onClick={() => setOpen(false)}>Fermer</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
