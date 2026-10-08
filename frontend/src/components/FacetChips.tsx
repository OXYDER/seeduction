import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { facetTone, loadFacetSchema, type FacetDef, type FacetValues } from '../lib/facets';
import { facetValueFr } from '../lib/frText';

/** Filtres de catégorie d'un torrent sur sa fiche : chaque valeur est une pastille de couleur qui mène à Parcourir filtré. */
export default function FacetChips({ attrs, categoryId }: { attrs?: FacetValues | null; categoryId?: string }) {
  const [schema, setSchema] = useState<Record<string, FacetDef>>({});
  useEffect(() => { void loadFacetSchema().then(setSchema); }, []);
  const entries = Object.entries(attrs ?? {}).filter(([, v]) => Array.isArray(v) && v.length > 0);
  if (entries.length === 0) return null;
  return (
    <div className="facet-detail">
      {entries.map(([key, values]) => (
        <div key={key} className="facet-detail-row">
          <span className="muted">{schema[key]?.label ?? key}</span>
          {values.map((v) => (
            <Link key={v} to={`/browse?${categoryId ? `categoryId=${categoryId}&` : ''}f.${encodeURIComponent(key)}=${encodeURIComponent(v)}`} className={`vr-chip ${facetTone(key)}`} title="Voir les torrents avec ce filtre">{facetValueFr(v)}</Link>
          ))}
        </div>
      ))}
    </div>
  );
}
