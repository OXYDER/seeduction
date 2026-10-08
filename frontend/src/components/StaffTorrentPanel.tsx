import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import WysiwygEditor from './WysiwygEditor';
import FacetFields from './FacetFields';
import FichePanel from './FichePanel';
import { LANGUAGE_GROUPS, LANGUAGE_LABELS } from '../lib/languageTag';
import type { FacetDef, FacetValues } from '../lib/facets';

const STATUSES = [
  { value: 'APPROVED', label: 'Approuvé' },
  { value: 'PENDING', label: 'En attente' },
  { value: 'REJECTED', label: 'Rejeté' },
  { value: 'DEAD', label: 'Mort' },
];

/** Modifier ou supprimer un torrent directement depuis sa fiche (modérateurs, admins, propriétaire). */
export default function StaffTorrentPanel({ torrent, startOpen, openSignal, onSaved }: { torrent: any; startOpen?: boolean; openSignal?: number; onSaved: (patch: any) => void }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(!!startOpen);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [name, setName] = useState(torrent.name);
  const [categoryId, setCategoryId] = useState(torrent.categoryId ?? torrent.category?.id ?? '');
  const [status, setStatus] = useState(torrent.status ?? 'APPROVED');
  const [freeleech, setFreeleech] = useState(!!torrent.freeleech);
  const [doubleUpload, setDoubleUpload] = useState(!!torrent.doubleUpload);
  const [description, setDescription] = useState(torrent.description ?? '');
  const [coverImage, setCoverImage] = useState(torrent.coverImage ?? '');
  const [overview, setOverview] = useState<string>(torrent.metadata?.overview ?? '');
  const [language, setLanguage] = useState<string>(torrent.language ?? '');
  // Filtres de la catégorie (format, genre, console...) : ceux de la catégorie choisie, avec les valeurs actuelles du torrent.
  const [facetDefs, setFacetDefs] = useState<FacetDef[]>([]);
  const [attrs, setAttrs] = useState<FacetValues>((torrent.attrs as FacetValues) ?? {});

  // Statut et options changés ailleurs (barre de modération de la fiche) : le formulaire les reprend pour ne pas les écraser à l'enregistrement.
  useEffect(() => { setStatus(torrent.status ?? 'APPROVED'); setFreeleech(!!torrent.freeleech); setDoubleUpload(!!torrent.doubleUpload); }, [torrent.status, torrent.freeleech, torrent.doubleUpload]);
  // Le bouton « Modifier » de la barre ouvre ce panneau et y amène l'écran.
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!openSignal) return;
    setOpen(true);
    requestAnimationFrame(() => root.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  }, [openSignal]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || categories.length > 0) return;
    api.get('/categories', { params: { includeAdult: 1 } }).then((r) => {
      setCategories(r.data.flatMap((c: any) => (c.children?.length
        ? c.children.map((sub: any) => ({ id: sub.id, name: `${c.name} › ${sub.name}` }))
        : [{ id: c.id, name: c.name }])));
    }).catch(() => {});
  }, [open, categories.length]);

  useEffect(() => {
    if (!open || !categoryId) return;
    api.post('/torrents/analyze', { categoryId, name: '', files: [] }).then((r) => setFacetDefs(r.data.facets ?? [])).catch(() => {});
  }, [open, categoryId]);

  async function uploadCover(file: File | undefined) {
    if (!file) return;
    const form = new FormData();
    form.append('file', file);
    try {
      const { data } = await api.post('/covers/upload', form);
      setCoverImage(data.url);
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Échec du téléversement');
    }
  }

  async function save() {
    setBusy(true);
    setError('');
    setMessage('');
    const overviewChanged = overview !== (torrent.metadata?.overview ?? '');
    const patch = { name, categoryId, status, freeleech, doubleUpload, description, coverImage: coverImage || null, attrs, language: language || null };
    try {
      await api.patch(`/admin/torrents/${torrent.id}`, { ...patch, language, ...(overviewChanged ? { overview } : {}) });
      const category = categories.find((c) => c.id === categoryId);
      onSaved({ ...patch, ...(overviewChanged ? { metadata: { ...(torrent.metadata ?? {}), overview: overview.trim() || null } } : {}), category: category ? { id: category.id, name: category.name.split(' › ').pop() } : torrent.category });
      setMessage('✓ Modifications enregistrées');
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Erreur lors de la modification');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Supprimer définitivement « ${torrent.name} » ? Cette action est irréversible.`)) return;
    setBusy(true);
    try {
      await api.delete(`/admin/torrents/${torrent.id}`);
      navigate('/browse');
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Suppression impossible');
      setBusy(false);
    }
  }

  return (
    <div className="panel ornate" ref={root}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="panel-title" style={{ margin: 0, padding: 0, border: 0 }}><span className="title-icon">✏️</span>Édition du torrent</div>
        <div className="row">
          <button type="button" className="secondary" onClick={() => setOpen((v) => !v)}>{open ? 'Fermer' : '✏️ Modifier ce torrent'}</button>
          <button type="button" className="danger" onClick={remove} disabled={busy}>🗑️ Supprimer</button>
        </div>
      </div>

      {open && (
        <div className="grid" style={{ marginTop: 14, gap: 12 }}>
          <div>
            <div className="muted" style={{ marginBottom: 4 }}>Nom</div>
            <input value={name} onChange={(e) => setName(e.target.value)} style={{ width: '100%' }} />
          </div>
          <div className="filter-grid">
            <div>
              <div className="muted" style={{ marginBottom: 4 }}>Catégorie</div>
              <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} style={{ width: '100%' }}>
                {categories.length === 0 && <option value={categoryId}>{torrent.category?.name}</option>}
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <div className="muted" style={{ marginBottom: 4 }}>Statut</div>
              <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ width: '100%' }}>
                {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <div className="muted" style={{ marginBottom: 4 }}>Langue</div>
              <select value={language} onChange={(e) => setLanguage(e.target.value)} style={{ width: '100%' }}>
                <option value="">— non précisée —</option>
                {language && !LANGUAGE_GROUPS.some((g) => g.values.includes(language)) && <option value={language}>{language}</option>}
                {LANGUAGE_GROUPS.map((g) => (
                  <optgroup key={g.label} label={g.label}>{g.values.map((v) => <option key={v} value={v}>{LANGUAGE_LABELS[v] ?? v}</option>)}</optgroup>
                ))}
              </select>
            </div>
            <label className="row muted" style={{ gap: 6 }}>
              <input type="checkbox" style={{ width: 'auto' }} checked={freeleech} onChange={(e) => setFreeleech(e.target.checked)} /> Freeleech
            </label>
            <label className="row muted" style={{ gap: 6 }}>
              <input type="checkbox" style={{ width: 'auto' }} checked={doubleUpload} onChange={(e) => setDoubleUpload(e.target.checked)} /> Double upload
            </label>
          </div>
          <div className="row" style={{ gap: 10 }}>
            {coverImage && <img src={coverImage} alt="" style={{ width: 50, height: 70, objectFit: 'cover', borderRadius: 4 }} />}
            <label className="secondary" style={{ cursor: 'pointer', padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 13 }}>
              🖼️ {coverImage ? 'Changer la pochette' : 'Ajouter une pochette'}
              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => uploadCover(e.target.files?.[0])} />
            </label>
            {coverImage && <button type="button" className="secondary" onClick={() => setCoverImage('')}>Retirer</button>}
          </div>
          {facetDefs.length > 0 && (
            <div>
              <div className="muted" style={{ marginBottom: 6 }}>Filtres de la catégorie</div>
              <FacetFields defs={facetDefs} values={attrs} onChange={(key, next) => setAttrs((cur) => ({ ...cur, [key]: next }))} />
            </div>
          )}
          <FichePanel torrent={torrent} onChanged={onSaved} />
          <div>
            <div className="muted" style={{ marginBottom: 4 }}>Synopsis affiché (sous le titre et dans les listes)</div>
            <textarea value={overview} onChange={(e) => setOverview(e.target.value)} rows={4} style={{ width: '100%' }} placeholder="Modifier ici remplace le synopsis de la fiche (il n'est plus retraduit automatiquement)." />
          </div>
          <div>
            <div className="muted" style={{ marginBottom: 4 }}>Description</div>
            <WysiwygEditor value={description} onChange={setDescription} minHeight={260} />
          </div>
          {error && <div className="muted" style={{ color: 'var(--danger)' }}>{error}</div>}
          {message && <div className="muted" style={{ color: 'var(--success)' }}>{message}</div>}
          <div className="row">
            <button type="button" onClick={save} disabled={busy || !name.trim()}>{busy ? 'Enregistrement...' : 'Enregistrer'}</button>
          </div>
        </div>
      )}
      {!open && error && <div className="muted" style={{ color: 'var(--danger)', marginTop: 8 }}>{error}</div>}
    </div>
  );
}
