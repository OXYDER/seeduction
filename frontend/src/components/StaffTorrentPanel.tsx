import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import WysiwygEditor from './WysiwygEditor';
import FacetFields from './FacetFields';
import FichePanel from './FichePanel';
import { LANGUAGE_GROUPS, LANGUAGE_LABELS } from '../lib/languageTag';
import type { FacetDef, FacetValues } from '../lib/facets';
import { ORIGINS, RESOLUTIONS, SOURCES, CODECS, AUDIO_FORMATS, CONTAINERS } from '../lib/searchParser';
import ReleaseNameSuggest from './ReleaseNameSuggest';

const STATUSES = [
  { value: 'APPROVED', label: 'Approuvé' },
  { value: 'PENDING', label: 'En attente' },
  { value: 'REJECTED', label: 'Rejeté' },
  { value: 'DEAD', label: 'Mort' },
];

/**
 * Modifier ou supprimer un torrent directement depuis sa fiche : le staff (tout, y compris statut et freeleech) ou l'envoyeur (`owner` : tout sauf statut,
 * freeleech et double upload ; suppression seulement tant que le torrent est en attente ou rejeté ; un torrent rejeté corrigé repart en validation).
 */
export default function StaffTorrentPanel({ torrent, startOpen, openSignal, onSaved, owner }: { torrent: any; startOpen?: boolean; openSignal?: number; onSaved: (patch: any) => void; owner?: boolean }) {
  const base = owner ? '/my-torrents' : '/admin/torrents';
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
  // Caractéristiques de la release : tout se corrige, comme à l'envoi.
  const [year, setYear] = useState<string>(torrent.year != null ? String(torrent.year) : '');
  const [resolution, setResolution] = useState<string>(torrent.resolution ?? '');
  const [source, setSource] = useState<string>(torrent.source ?? '');
  const [codec, setCodec] = useState<string>(torrent.codec ?? '');
  const [audio, setAudio] = useState<string>(torrent.audio ?? '');
  const [containerFormat, setContainerFormat] = useState<string>(torrent.containerFormat ?? '');
  const [hdr, setHdr] = useState(!!torrent.hdr);
  const [season, setSeason] = useState<string>(torrent.season ?? '');
  const [episode, setEpisode] = useState<string>(torrent.episode ?? '');
  const [origin, setOrigin] = useState<string>(torrent.origin ?? '');
  const [releaseDate, setReleaseDate] = useState<string>(torrent.releaseDate ?? '');
  const [genres, setGenres] = useState<string>((torrent.genres ?? []).join(', '));
  const [tags, setTags] = useState<string>((torrent.tags ?? []).join(', '));
  const [subtitles, setSubtitles] = useState<string>((torrent.subtitles ?? []).join(', '));
  const [anonymous, setAnonymous] = useState(!!torrent.anonymousUpload);
  const [nfo, setNfo] = useState('');
  const [nfoLoaded, setNfoLoaded] = useState(false);
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
    api.get('/categories', { params: owner ? undefined : { includeAdult: 1 } }).then((r) => {
      setCategories(r.data.flatMap((c: any) => (c.children?.length
        ? c.children.map((sub: any) => ({ id: sub.id, name: `${c.name} › ${sub.name}` }))
        : [{ id: c.id, name: c.name }])));
    }).catch(() => {});
  }, [open, categories.length]);

  // Le NFO est chargé à l'ouverture : il se corrige aussi.
  useEffect(() => {
    if (!open || nfoLoaded) return;
    api.get(`/torrents/${torrent.id}/nfo`).then((r) => { setNfo(r.data?.content ?? ''); setNfoLoaded(true); }).catch(() => setNfoLoaded(true));
  }, [open, nfoLoaded, torrent.id]);

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
    const list = (v: string) => v.split(',').map((x) => x.trim()).filter(Boolean);
    const tech = { year: year.trim() ? Number(year) : null, resolution, source, codec, audio, containerFormat, hdr, season, episode, origin, releaseDate: releaseDate.trim(), genres: list(genres), tags: list(tags), subtitles: list(subtitles), anonymousUpload: anonymous };
    const patch = { name, categoryId, description, coverImage: coverImage || null, attrs, language: language || null, ...tech, ...(owner ? {} : { status, freeleech, doubleUpload }) };
    try {
      const { data: saved } = await api.patch(`${base}/${torrent.id}`, { ...patch, language, ...(overviewChanged ? { overview } : {}), ...(nfoLoaded && nfo.trim() ? { nfo } : {}) });
      const category = categories.find((c) => c.id === categoryId);
      onSaved({ ...patch, ...(overviewChanged ? { metadata: { ...(torrent.metadata ?? {}), overview: overview.trim() || null } } : {}), category: category ? { id: category.id, name: category.name.split(' › ').pop() } : torrent.category });
      setMessage(saved?.resubmitted ? '✓ Modifications enregistrées : le torrent est renvoyé en validation' : '✓ Modifications enregistrées');
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
      await api.delete(`${base}/${torrent.id}`);
      navigate('/browse');
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Suppression impossible');
      setBusy(false);
    }
  }

  return (
    <div className="panel ornate" ref={root}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="panel-title" style={{ margin: 0, padding: 0, border: 0 }}><span className="title-icon">✏️</span>{owner ? 'Modifier mon torrent' : 'Édition du torrent'}</div>
        <div className="row">
          <button type="button" className="secondary" onClick={() => setOpen((v) => !v)}>{open ? 'Fermer' : '✏️ Modifier ce torrent'}</button>
          {(!owner || ['PENDING', 'REJECTED'].includes(torrent.status)) && <button type="button" className="danger" onClick={remove} disabled={busy}>🗑️ Supprimer</button>}
        </div>
      </div>

      {open && (
        <div className="grid" style={{ marginTop: 14, gap: 12 }}>
          <div>
            <div className="muted" style={{ marginBottom: 4 }}>Nom</div>
            <input value={name} onChange={(e) => setName(e.target.value)} style={{ width: '100%' }} />
            <ReleaseNameSuggest name={name} torrentId={torrent.id} onPick={setName} />
          </div>
          <div className="filter-grid">
            <div>
              <div className="muted" style={{ marginBottom: 4 }}>Catégorie</div>
              <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} style={{ width: '100%' }}>
                {categories.length === 0 && <option value={categoryId}>{torrent.category?.name}</option>}
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            {!owner && (
              <div>
                <div className="muted" style={{ marginBottom: 4 }}>Statut</div>
                <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ width: '100%' }}>
                  {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
            )}
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
            {!owner && (
              <>
                <label className="row muted" style={{ gap: 6 }}>
                  <input type="checkbox" style={{ width: 'auto' }} checked={freeleech} onChange={(e) => setFreeleech(e.target.checked)} /> Freeleech
                </label>
                <label className="row muted" style={{ gap: 6 }}>
                  <input type="checkbox" style={{ width: 'auto' }} checked={doubleUpload} onChange={(e) => setDoubleUpload(e.target.checked)} /> Double upload
                </label>
              </>
            )}
          </div>
          <div>
            <div className="muted" style={{ marginBottom: 6 }}>Caractéristiques de la release</div>
            <div className="tech-grid">
              <label className="grid" style={{ gap: 2 }}><span className="muted">Année</span><input value={year} onChange={(e) => setYear(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="2024" /></label>
              <label className="grid" style={{ gap: 2 }}><span className="muted">Date de sortie</span><input value={releaseDate} onChange={(e) => setReleaseDate(e.target.value)} placeholder="AAAA-MM-JJ" /></label>
              <label className="grid" style={{ gap: 2 }}><span className="muted">Résolution</span>
                <select value={resolution} onChange={(e) => setResolution(e.target.value)}><option value="">—</option>{resolution && !RESOLUTIONS.includes(resolution) && <option value={resolution}>{resolution}</option>}{RESOLUTIONS.map((v) => <option key={v} value={v}>{v}</option>)}</select></label>
              <label className="grid" style={{ gap: 2 }}><span className="muted">Source</span>
                <select value={source} onChange={(e) => setSource(e.target.value)}><option value="">—</option>{source && !SOURCES.includes(source) && <option value={source}>{source}</option>}{SOURCES.map((v) => <option key={v} value={v}>{v}</option>)}</select></label>
              <label className="grid" style={{ gap: 2 }}><span className="muted">Codec vidéo</span>
                <select value={codec} onChange={(e) => setCodec(e.target.value)}><option value="">—</option>{codec && !CODECS.includes(codec) && <option value={codec}>{codec}</option>}{CODECS.map((v) => <option key={v} value={v}>{v}</option>)}</select></label>
              <label className="grid" style={{ gap: 2 }}><span className="muted">Codec audio</span>
                <select value={audio} onChange={(e) => setAudio(e.target.value)}><option value="">—</option>{audio && !AUDIO_FORMATS.includes(audio) && <option value={audio}>{audio}</option>}{AUDIO_FORMATS.map((v) => <option key={v} value={v}>{v}</option>)}</select></label>
              <label className="grid" style={{ gap: 2 }}><span className="muted">Format du fichier</span>
                <select value={containerFormat} onChange={(e) => setContainerFormat(e.target.value)}><option value="">—</option>{containerFormat && !CONTAINERS.includes(containerFormat) && <option value={containerFormat}>{containerFormat}</option>}{CONTAINERS.map((v) => <option key={v} value={v}>{v}</option>)}</select></label>
              <label className="grid" style={{ gap: 2 }}><span className="muted">Origine</span>
                <select value={origin} onChange={(e) => setOrigin(e.target.value)}><option value="">—</option>{origin && !ORIGINS.includes(origin) && <option value={origin}>{origin}</option>}{ORIGINS.map((v) => <option key={v} value={v}>{v}</option>)}</select></label>
              <label className="grid" style={{ gap: 2 }}><span className="muted">Saison</span><input value={season} onChange={(e) => setSeason(e.target.value)} placeholder="2 ou Intégrale" /></label>
              <label className="grid" style={{ gap: 2 }}><span className="muted">Épisode</span><input value={episode} onChange={(e) => setEpisode(e.target.value)} placeholder="5 ou Saison complète" /></label>
              <label className="grid" style={{ gap: 2 }}><span className="muted">Genres (séparés par une virgule)</span><input value={genres} onChange={(e) => setGenres(e.target.value)} /></label>
              <label className="grid" style={{ gap: 2 }}><span className="muted">Mots-clés (séparés par une virgule)</span><input value={tags} onChange={(e) => setTags(e.target.value)} /></label>
              <label className="grid" style={{ gap: 2 }} title="Lus automatiquement dans le MediaInfo / NFO : corrige-les ici (FR, EN, ES, FR forcés, FR SDH...)"><span className="muted">Sous-titres (FR, EN, FR forcés…)</span><input value={subtitles} onChange={(e) => setSubtitles(e.target.value)} placeholder="FR, EN" /></label>
              <label className="row muted" style={{ gap: 6 }}><input type="checkbox" style={{ width: 'auto' }} checked={hdr} onChange={(e) => setHdr(e.target.checked)} /> HDR</label>
              <label className="row muted" style={{ gap: 6 }}><input type="checkbox" style={{ width: 'auto' }} checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} /> Envoi anonyme</label>
            </div>
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
          <FichePanel torrent={torrent} onChanged={onSaved} base={base} />
          <div>
            <div className="muted" style={{ marginBottom: 4 }}>Synopsis affiché (sous le titre et dans les listes)</div>
            <textarea value={overview} onChange={(e) => setOverview(e.target.value)} rows={4} style={{ width: '100%' }} placeholder="Modifier ici remplace le synopsis de la fiche (il n'est plus retraduit automatiquement)." />
          </div>
          <div>
            <div className="muted" style={{ marginBottom: 4 }}>Description</div>
            <WysiwygEditor value={description} onChange={setDescription} minHeight={260} />
          </div>
          <div>
            <div className="muted" style={{ marginBottom: 4 }}>NFO / MediaInfo</div>
            <textarea value={nfo} onChange={(e) => setNfo(e.target.value)} rows={8} style={{ width: '100%', fontFamily: 'monospace', fontSize: 12 }} placeholder={nfoLoaded ? 'Colle ici le NFO ou le MediaInfo de la release (obligatoire).' : 'Chargement du NFO…'} />
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
