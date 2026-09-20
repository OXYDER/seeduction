import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuthStore } from '../store/auth';
import DescriptionGenerator from '../components/DescriptionGenerator';
import { RESOLUTIONS, LANGUAGES, SOURCES, CODECS, AUDIO_FORMATS, CONTAINERS, detectFromReleaseName } from '../lib/searchParser';
import { parseTorrentInfo } from '../lib/bencode';

export default function Upload() {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [categories, setCategories] = useState<any[]>([]);
  const [tags, setTags] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  const [showMeta, setShowMeta] = useState(false);
  const [year, setYear] = useState('');
  const [language, setLanguage] = useState('');
  const [resolution, setResolution] = useState('');
  const [codec, setCodec] = useState('');
  const [hdr, setHdr] = useState(false);
  const [audio, setAudio] = useState('');
  const [source, setSource] = useState('');
  const [containerFormat, setContainerFormat] = useState('');
  const [fps, setFps] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('');
  const [autoDetected, setAutoDetected] = useState<Set<string>>(new Set());
  const [fileList, setFileList] = useState<{ path: string; size: number }[]>([]);

  const selectedCategory = categories.flatMap((c) => [c, ...(c.children ?? [])]).find((c) => c.id === categoryId);
  const generatorKnownValues = {
    titre: name,
    catégorie: selectedCategory?.name ?? '',
    auteur: anonymous ? 'Anonyme' : (user?.username ?? ''),
    année: year,
    langue: language,
    vidéo: [resolution, codec].filter(Boolean).join(' '),
    audio,
    source,
    sous_titres: language === 'VOSTFR' ? 'Français' : '',
  };

  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');

  useEffect(() => {
    api.get('/categories').then((r) => setCategories(r.data));
    api.get('/ai/status').then((r) => setAiEnabled(r.data.enabled)).catch(() => {});
  }, []);

  async function suggestDescription() {
    setAiLoading(true);
    setAiError('');
    try {
      const { data } = await api.post('/ai/suggest-description', {
        name,
        category: selectedCategory?.name,
        tags,
        files: fileList.map((f) => f.path),
        meta: { année: year, langue: language, résolution: resolution, codec, audio, source, format: containerFormat, HDR: hdr },
      });
      setDescription(data.description);
    } catch (err: any) {
      setAiError(err.response?.data?.message ?? "L'assistant IA est indisponible");
    } finally {
      setAiLoading(false);
    }
  }

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setFileList([]);
    setAutoDetected(new Set());
    if (!f) return;

    try {
      const parsed = await parseTorrentInfo(f);
      setFileList(parsed.files);
      if (!name.trim()) setName(parsed.name);

      const detected = detectFromReleaseName([parsed.name, ...parsed.files.map((x) => x.path)].join(' '));
      const newlyDetected = new Set<string>();

      if (detected.year && !year) { setYear(String(detected.year)); newlyDetected.add('year'); }
      if (detected.resolution && !resolution) { setResolution(detected.resolution); newlyDetected.add('resolution'); }
      if (detected.language && !language) { setLanguage(detected.language); newlyDetected.add('language'); }
      if (detected.source && !source) { setSource(detected.source); newlyDetected.add('source'); }
      if (detected.codec && !codec) { setCodec(detected.codec); newlyDetected.add('codec'); }
      if (detected.audio && !audio) { setAudio(detected.audio); newlyDetected.add('audio'); }
      if (detected.hdr && !hdr) { setHdr(true); newlyDetected.add('hdr'); }

      // Format de conteneur : extension majoritaire des fichiers, plus fiable que le texte du nom.
      if (!containerFormat) {
        const extCounts: Record<string, number> = {};
        for (const entry of parsed.files) {
          const ext = entry.path.split('.').pop()?.toUpperCase();
          if (ext && CONTAINERS.includes(ext)) extCounts[ext] = (extCounts[ext] ?? 0) + 1;
        }
        const topExt = Object.entries(extCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
        if (topExt) { setContainerFormat(topExt); newlyDetected.add('containerFormat'); }
      }

      if (newlyDetected.size > 0) { setAutoDetected(newlyDetected); setShowMeta(true); }
    } catch {
      // Fichier .torrent illisible : on laisse la saisie 100% manuelle, silencieusement.
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) { setError('Sélectionne un fichier .torrent'); return; }
    if (!categoryId) { setError('Choisis une catégorie'); return; }
    const form = new FormData();
    form.append('torrentFile', file);
    form.append('name', name);
    form.append('description', description);
    form.append('categoryId', categoryId);
    form.append('tags', tags);
    form.append('anonymous', String(anonymous));
    if (year) form.append('year', year);
    if (language) form.append('language', language);
    if (resolution) form.append('resolution', resolution);
    if (codec) form.append('codec', codec);
    form.append('hdr', String(hdr));
    if (audio) form.append('audio', audio);
    if (source) form.append('source', source);
    if (containerFormat) form.append('containerFormat', containerFormat);
    if (fps) form.append('fps', fps);
    if (durationMinutes) form.append('durationMinutes', durationMinutes);
    try {
      const { data } = await api.post('/torrents/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      navigate(`/torrents/${data.id}`);
    } catch (err: any) {
      setError(err.response?.data?.message ?? "Erreur d'upload");
    }
  }

  return (
    <div className="grid">
      <h1>Uploader un torrent</h1>
      <div className="split-2-reverse">
        <div className="panel">
          <form onSubmit={submit} className="grid">
            <input type="file" accept=".torrent" onChange={onFileChange} required />
            {fileList.length > 0 && (
              <p className="muted" style={{ fontSize: 12, margin: 0 }}>
                🔍 {fileList.length} fichier{fileList.length > 1 ? 's' : ''} détecté{fileList.length > 1 ? 's' : ''} dans le .torrent
                {autoDetected.size > 0 && ` — métadonnées techniques préremplies automatiquement`}
              </p>
            )}
            <input placeholder="Nom" value={name} onChange={(e) => setName(e.target.value)} required />
            <textarea placeholder="Description" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />
            {aiEnabled && (
              <div className="row" style={{ gap: 10, alignItems: 'center' }}>
                <button type="button" className="secondary" disabled={aiLoading || !name.trim()} onClick={suggestDescription}>
                  {aiLoading ? 'Rédaction...' : '✨ Suggérer une description (IA)'}
                </button>
                <span className="muted" style={{ fontSize: 12 }}>
                  Remplace le texte ci-dessus par un brouillon à relire — l'IA peut se tromper.
                </span>
              </div>
            )}
            {aiError && <div style={{ color: 'var(--danger)' }} className="muted">{aiError}</div>}
            <DescriptionGenerator knownValues={generatorKnownValues} onUse={setDescription} />
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} required>
              <option value="">— Choisir une catégorie —</option>
              {categories.map((c) => (
                <optgroup key={c.id} label={c.name}>
                  <option value={c.id}>{c.name}</option>
                  {c.children?.map((sub: any) => (
                    <option key={sub.id} value={sub.id}>↳ {sub.name}</option>
                  ))}
                </optgroup>
              ))}
            </select>
            <input placeholder="Tags (séparés par virgule)" value={tags} onChange={(e) => setTags(e.target.value)} />

            <button type="button" className="secondary" style={{ alignSelf: 'flex-start' }} onClick={() => setShowMeta((v) => !v)}>
              {showMeta ? 'Masquer' : '+ Métadonnées techniques (optionnel)'}
            </button>
            {showMeta && (
              <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8 }}>
                <input type="number" placeholder="Année" value={year} onChange={(e) => setYear(e.target.value)} />
                <select value={language} onChange={(e) => setLanguage(e.target.value)}>
                  <option value="">Langue</option>
                  {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
                <select value={resolution} onChange={(e) => setResolution(e.target.value)}>
                  <option value="">Résolution</option>
                  {RESOLUTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
                <select value={codec} onChange={(e) => setCodec(e.target.value)}>
                  <option value="">Codec</option>
                  {CODECS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <select value={audio} onChange={(e) => setAudio(e.target.value)}>
                  <option value="">Audio</option>
                  {AUDIO_FORMATS.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
                <select value={source} onChange={(e) => setSource(e.target.value)}>
                  <option value="">Source</option>
                  {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <select value={containerFormat} onChange={(e) => setContainerFormat(e.target.value)}>
                  <option value="">Format</option>
                  {CONTAINERS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <input type="number" placeholder="FPS" value={fps} onChange={(e) => setFps(e.target.value)} />
                <input type="number" placeholder="Durée (min)" value={durationMinutes} onChange={(e) => setDurationMinutes(e.target.value)} />
                <label className="row muted" style={{ gap: 6 }}>
                  <input type="checkbox" style={{ width: 'auto' }} checked={hdr} onChange={(e) => setHdr(e.target.checked)} /> HDR
                </label>
              </div>
            )}

            <label className="row"><input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} style={{ width: 'auto' }} /> Upload anonyme</label>
            {error && <div style={{ color: 'var(--danger)' }} className="muted">{error}</div>}
            <button type="submit">Uploader</button>
          </form>
        </div>

        <div className="panel ornate">
          <div className="panel-title"><span className="title-icon">📜</span>À savoir avant d'uploader</div>
          <div className="grid" style={{ gap: 12 }}>
            <div>
              <strong>Un seul upload par contenu</strong>
              <p className="muted" style={{ margin: '4px 0 0' }}>Vérifie qu'il n'existe pas déjà via Parcourir avant d'envoyer.</p>
            </div>
            <div>
              <strong>Bonne catégorie</strong>
              <p className="muted" style={{ margin: '4px 0 0' }}>Choisis la sous-catégorie la plus précise si elle existe.</p>
            </div>
            <div>
              <strong>Métadonnées</strong>
              <p className="muted" style={{ margin: '4px 0 0' }}>Année, résolution, langue... aident les autres membres à filtrer leur recherche. Elles sont préremplies automatiquement à partir du nom des fichiers du .torrent quand c'est possible — vérifie-les avant d'envoyer.</p>
            </div>
            <div>
              <strong>Modération</strong>
              <p className="muted" style={{ margin: '4px 0 0' }}>Ton torrent reste en attente jusqu'à l'approbation du staff.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
