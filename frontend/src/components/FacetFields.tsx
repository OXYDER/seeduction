import { useState } from 'react';
import type { FacetDef, FacetValues } from '../lib/facets';

/**
 * Filtres de la catégorie dans le formulaire d'envoi (et l'édition staff). Ce qui a été trouvé automatiquement s'affiche en
 * résumé (✓ ... Modifier) ; ce qui n'a pas été trouvé se choisit d'un clic parmi les valeurs proposées.
 */
export default function FacetFields({ defs, values, onChange, found }: {
  defs: FacetDef[]; values: FacetValues; onChange: (key: string, next: string[]) => void; found?: Set<string>;
}) {
  const [editing, setEditing] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState<Record<string, string>>({});
  const toggleEdit = (key: string) => setEditing((s) => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n; });

  return (
    <div className="facet-fields">
      {defs.map((d) => {
        const current = values[d.key] ?? [];
        const isEditing = editing.has(d.key);
        if (current.length > 0 && !isEditing) {
          return (
            <div key={d.key} className="facet-found">
              <span className="muted">{d.label}</span>
              <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                <span style={{ color: 'var(--success)' }}>✓</span>
                <strong>{current.join(', ')}</strong>
                {found?.has(d.key) && <span className="muted" style={{ fontSize: 11 }}>trouvé automatiquement</span>}
                <button type="button" className="secondary" style={{ padding: '2px 10px', fontSize: 12 }} onClick={() => toggleEdit(d.key)}>Modifier</button>
              </div>
            </div>
          );
        }
        const q = (query[d.key] ?? '').toLowerCase();
        const options = q ? d.options.filter((o) => o.toLowerCase().includes(q)) : d.options;
        return (
          <div key={d.key} className="facet-pick">
            <span className="muted">{d.label}{d.multi ? ' (plusieurs possibles)' : ''}</span>
            {d.options.length > 16 && <input className="facet-filter" placeholder={`Chercher dans ${d.label.toLowerCase()}…`} value={query[d.key] ?? ''} onChange={(e) => setQuery((s) => ({ ...s, [d.key]: e.target.value }))} />}
            <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
              {options.map((o) => {
                const on = current.includes(o);
                return (
                  <button key={o} type="button" className={on ? '' : 'secondary'} style={{ padding: '3px 10px', fontSize: 12 }}
                    onClick={() => onChange(d.key, d.multi ? (on ? current.filter((x) => x !== o) : [...current, o]) : (on ? [] : [o]))}>{o}</button>
                );
              })}
              {options.length === 0 && <span className="muted" style={{ fontSize: 12 }}>Aucune valeur ne correspond.</span>}
            </div>
            {current.length > 0 && <button type="button" className="secondary" style={{ alignSelf: 'flex-start', padding: '2px 10px', fontSize: 12 }} onClick={() => toggleEdit(d.key)}>OK</button>}
          </div>
        );
      })}
    </div>
  );
}
