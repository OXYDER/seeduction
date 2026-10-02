import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';

interface Field { key: string; group: string; label: string; help: string | null; min: number; max: number; step: number; value: number; default: number }

/** Admin > Paramètres : cadeau de bienvenue, ratio minimum, hit & run, points bonus, re-seed, boutique, rangs, invitations. */
export function ConfigAdmin() {
  const [fields, setFields] = useState<Field[] | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => api.get('/admin/config').then((r) => { setFields(r.data); setDraft({}); }).catch((e) => setError(e.response?.data?.message ?? 'Chargement impossible'));
  useEffect(() => { void load(); }, []);

  const groups = useMemo(() => {
    const map = new Map<string, Field[]>();
    (fields ?? []).forEach((f) => { if (!map.has(f.group)) map.set(f.group, []); map.get(f.group)!.push(f); });
    return [...map.entries()];
  }, [fields]);

  const dirty = Object.keys(draft).length;
  const flash = (t: string) => { setMessage(t); setTimeout(() => setMessage(''), 4000); };

  async function save() {
    setError(''); setBusy(true);
    try {
      const body: Record<string, number> = {};
      for (const [k, v] of Object.entries(draft)) body[k] = Number(v);
      const { data } = await api.patch('/admin/config', body);
      setFields(data); setDraft({});
      flash('✓ Paramètres enregistrés — appliqués tout de suite');
    } catch (err: any) { setError(err.response?.data?.message ?? 'Enregistrement impossible'); }
    finally { setBusy(false); }
  }

  async function resetOne(f: Field) {
    try { const { data } = await api.post('/admin/config/reset', { keys: [f.key] }); setFields(data); setDraft((d) => { const n = { ...d }; delete n[f.key]; return n; }); }
    catch (err: any) { setError(err.response?.data?.message ?? 'Action impossible'); }
  }

  async function applyMinRatio() {
    if (!window.confirm('Donner le ratio minimum par défaut à TOUS les membres existants ? (Enregistre d\'abord tes changements.)')) return;
    try { const { data } = await api.post('/admin/config/apply-min-ratio'); flash(`✓ Ratio minimum ${data.minRatio} appliqué à ${data.updated} membre(s)`); }
    catch (err: any) { setError(err.response?.data?.message ?? 'Action impossible'); }
  }

  if (!fields) return <p className="muted">{error || 'Chargement…'}</p>;

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="panel">
        <h3 style={{ marginTop: 0 }}>⚙️ Paramètres du tracker</h3>
        <p className="muted" style={{ margin: 0 }}>Ces réglages s'appliquent <strong>tout de suite</strong> et sont gardés au redémarrage. La valeur d'origine (backend/.env ou valeur du site) est affichée à côté ; le bouton « Origine » la rétablit.</p>
      </div>
      {error && <div className="panel" style={{ borderColor: 'var(--danger)' }}>{error}</div>}
      {message && <div className="mod-flash" role="status">{message}</div>}

      {groups.map(([group, list]) => (
        <section key={group} className="panel">
          <h3 style={{ marginTop: 0 }}>{group}</h3>
          <div className="cfg-grid">
            {list.map((f) => {
              const shown = draft[f.key] ?? String(f.value);
              const changed = Number(shown) !== f.default;
              return (
                <label key={f.key} className="cfg-field">
                  <span>{f.label}</span>
                  <span className="row" style={{ gap: 6 }}>
                    <input type="number" min={f.min} max={f.max} step={f.step} value={shown} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })} className={draft[f.key] !== undefined ? 'cfg-dirty' : ''} />
                    {changed && <button type="button" className="secondary cfg-reset" title={`Rétablir la valeur d'origine (${f.default})`} onClick={(e) => { e.preventDefault(); void resetOne(f); }}>Origine : {f.default}</button>}
                  </span>
                  {f.help && <small className="muted">{f.help}</small>}
                </label>
              );
            })}
          </div>
          {group === 'Ratio' && <div style={{ marginTop: 10 }}><button type="button" className="secondary" onClick={applyMinRatio}>Appliquer le ratio minimum par défaut à tous les membres</button></div>}
        </section>
      ))}

      <div className="cfg-bar">
        <span className="muted">{dirty ? `${dirty} modification${dirty > 1 ? 's' : ''} non enregistrée${dirty > 1 ? 's' : ''}` : 'Aucune modification'}</span>
        <span className="row" style={{ gap: 8 }}>
          {dirty > 0 && <button type="button" className="secondary" onClick={() => setDraft({})}>Annuler</button>}
          <button type="button" disabled={!dirty || busy} onClick={save}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button>
        </span>
      </div>
    </div>
  );
}
