import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { extractVariables } from '../lib/bbcode';

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
  { value: 'bbcode', label: 'BBCode' },
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

export default function DescriptionGenerator({
  knownValues = {},
  onUse,
}: {
  knownValues?: Record<string, string>;
  onUse: (text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [kind, setKind] = useState('FILM');
  const [templateId, setTemplateId] = useState('');
  const [expertMode, setExpertMode] = useState(false);
  const [content, setContent] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [format, setFormat] = useState<'bbcode' | 'markdown' | 'html' | 'text'>('bbcode');
  const [generated, setGenerated] = useState<{ bbcode: string; markdown: string; html: string; text: string; missingVariables: string[] } | null>(null);
  const [saveName, setSaveName] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) api.get('/templates').then((r) => setTemplates(r.data));
  }, [open]);

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
    // Pré-remplit avec ce qu'on connaît déjà (nom, taille, catégorie...), garde le reste tel quel.
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
      const { data } = await api.post('/templates/generate', { content, values });
      setGenerated(data);
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
          <div className="muted" style={{ marginBottom: 6 }}>1. Type de contenu</div>
          <div className="category-chips" style={{ marginTop: 0 }}>
            {KINDS.map((k) => (
              <a key={k.value} onClick={() => setKind(k.value)} style={{ cursor: 'pointer', borderColor: kind === k.value ? 'var(--gold)' : undefined }}>
                {k.label}
              </a>
            ))}
          </div>
        </div>

        <div>
          <div className="muted" style={{ marginBottom: 6 }}>2. Modèle</div>
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
            <div className="muted" style={{ marginBottom: 6 }}>3. Compléter les champs</div>
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

        {generated && (
          <div>
            <div className="muted" style={{ marginBottom: 6 }}>4. Aperçu</div>
            {generated.missingVariables.length > 0 && (
              <div className="muted" style={{ color: 'var(--gold-bright)', marginBottom: 6 }}>
                Champs vides : {generated.missingVariables.join(', ')}
              </div>
            )}
            <div className="row" style={{ marginBottom: 8 }}>
              {FORMATS.map((f) => (
                <button key={f.value} type="button" className={format === f.value ? '' : 'secondary'} onClick={() => setFormat(f.value)}>
                  {f.label}
                </button>
              ))}
            </div>
            <pre style={{
              background: 'var(--bg-panel-raised)', border: '1px solid var(--border)', borderRadius: 6,
              padding: 12, maxHeight: 260, overflow: 'auto', fontSize: 12, whiteSpace: 'pre-wrap',
            }}>
              {generated[format]}
            </pre>
            <div className="row" style={{ marginTop: 8 }}>
              <button type="button" onClick={() => onUse(generated[format])}>Utiliser cette description</button>
              <button type="button" className="secondary" onClick={() => navigator.clipboard.writeText(generated[format])}>Copier</button>
              <button type="button" className="secondary" onClick={() => setOpen(false)}>Fermer</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
