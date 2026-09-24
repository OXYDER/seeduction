import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuthStore } from '../store/auth';
import DescriptionGenerator from '../components/DescriptionGenerator';
import WysiwygEditor from '../components/WysiwygEditor';
import { ORIGINS, RESOLUTIONS, LANGUAGES, SOURCES, CODECS, AUDIO_FORMATS, CONTAINERS, detectFromReleaseName, cleanTitleForSearch } from '../lib/searchParser';
import { parseTorrentInfo } from '../lib/bencode';
import { summarizeTorrent } from '../lib/torrentSummary';
import { resolveContentKind } from '../lib/categoryKind';
import DuplicateWarning from '../components/DuplicateWarning';
import { GENRES, VIDEO_TYPES, SEASON_OPTIONS, EPISODE_OPTIONS, parseNfo, detectEpisodeInfo, detectVideoType } from '../lib/uploadMeta';

export default function Upload() {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [mainId, setMainId] = useState('');
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
  const [origin, setOrigin] = useState('');
  const [resolution, setResolution] = useState('');
  const [codec, setCodec] = useState('');
  const [hdr, setHdr] = useState(false);
  const [audio, setAudio] = useState('');
  const [source, setSource] = useState('');
  const [containerFormat, setContainerFormat] = useState('');
  const [fps, setFps] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('');
  const [season, setSeason] = useState('');
  const [episode, setEpisode] = useState('');
  const [genres, setGenres] = useState<string[]>([]);
  const [videoType, setVideoType] = useState('2D');
  const videoTouched = useRef(false);
  const [nfoText, setNfoText] = useState('');
  const [missing, setMissing] = useState<string[]>([]);
  const [autoDetected, setAutoDetected] = useState<Set<string>>(new Set());
  const [fileList, setFileList] = useState<{ path: string; size: number }[]>([]);
  const [foundTrackers, setFoundTrackers] = useState<string[]>([]);
  const [coverImage, setCoverImage] = useState('');
  const [meta, setMeta] = useState<{ kind: string; id: string } | null>(null);
  const [coverUploading, setCoverUploading] = useState(false);
  const autoName = useRef('');
  const [sessionKey, setSessionKey] = useState('');

  const selectedCategory = categories.flatMap((c) => [c, ...(c.children ?? [])]).find((c) => c.id === categoryId);
  // Le type de contenu du générateur vient de la catégorie choisie (configuré dans
  // Administration > Catégories torrents), avec repli sur la catégorie parente —
  // l'uploader n'a plus à le choisir lui-même.
  const parentCategory = categories.find((c) => c.children?.some((sub: any) => sub.id === categoryId));
  const defaultKind = resolveContentKind(selectedCategory, parentCategory);
  const isVideoKind = defaultKind === 'FILM' || defaultKind === 'SERIE';
  const searchInfo = cleanTitleForSearch(name);
  const summary = useMemo(() => summarizeTorrent(fileList), [fileList]);
  // "Artiste - Album" : la partie avant le premier " - " sert d'artiste pour les modèles musique.
  const artist = /\s-\s/.test(name) ? name.split(/\s-\s/)[0].replace(/[._]+/g, ' ').trim() : '';
  const generatorKnownValues: Record<string, string> = {
    titre: searchInfo.title || name,
    catégorie: selectedCategory?.name ?? '',
    uploader: anonymous ? 'Anonyme' : (user?.username ?? ''),
    artiste: artist,
    année: year,
    langue: language,
    vidéo: [resolution, codec].filter(Boolean).join(' '),
    audio,
    source,
    format: containerFormat || summary.mainFormat,
    sous_titres: summary.subtitlesText || (language === 'VOSTFR' ? 'Français' : ''),
    // Tiré directement du contenu du .torrent (jamais la taille du fichier .torrent lui-même).
    taille: fileList.length > 0 ? summary.totalSizeText : '',
    nb_fichiers: fileList.length > 0 ? String(summary.fileCount) : '',
    fichiers: summary.filesText,
  };

  useEffect(() => {
    api.get('/categories').then((r) => setCategories(r.data));
  }, []);

  // Remplissage automatique (nom, fichiers, NFO) : ne touche jamais à un champ déjà rempli.
  useEffect(() => {
    const text = [name, ...fileList.slice(0, 60).map((f) => f.path)].join(' ');
    const ep = detectEpisodeInfo(text);
    const nfo = parseNfo(nfoText);
    if (!season && (ep.season ?? nfo.season)) setSeason((ep.season ?? nfo.season) as string);
    if (!episode && (ep.episode ?? nfo.episode)) setEpisode((ep.episode ?? nfo.episode) as string);
    if (!language && nfo.language) setLanguage(nfo.language);
    if (!resolution && nfo.resolution) setResolution(nfo.resolution);
    if (!codec && nfo.codec) setCodec(nfo.codec);
    if (!audio && nfo.audio) setAudio(nfo.audio);
    if (!source && nfo.source) setSource(nfo.source);
    if (!containerFormat && nfo.containerFormat) setContainerFormat(nfo.containerFormat);
    if (!year && nfo.year) setYear(String(nfo.year));
    if (!fps && nfo.fps) setFps(String(nfo.fps));
    if (!durationMinutes && nfo.durationMinutes) setDurationMinutes(String(nfo.durationMinutes));
    if (!hdr && nfo.hdr) setHdr(true);
    if (genres.length === 0 && nfo.genres.length > 0) setGenres(nfo.genres);
    const vt = detectVideoType(text) ?? nfo.videoType;
    if (vt && !videoTouched.current) setVideoType(vt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, fileList, nfoText]);

  async function onNfoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) { setNfoText(''); return; }
    if (f.size > 500_000) { setError('Le NFO est trop gros (500 Ko maximum)'); return; }
    setNfoText((await f.text()).slice(0, 200_000));
  }

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setFileList([]);
    setFoundTrackers([]);
    setAutoDetected(new Set());
    if (!f) { setSessionKey(''); return; }
    setCoverImage('');
    setMeta(null);

    try {
      const parsed = await parseTorrentInfo(f);
      setFileList(parsed.files);
      setFoundTrackers(parsed.trackers);
      // Le nom se remplit depuis le fichier, sauf si l'utilisateur l'a déjà personnalisé.
      if (!name.trim() || name === autoName.current) { setName(parsed.name); autoName.current = parsed.name; }

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
    } finally {
      // Change seulement une fois le nom rempli, pour que la recherche auto parte du bon titre.
      setSessionKey(`${f.name}:${f.size}`);
    }
  }

  async function onCoverFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    if (!f) return;
    setCoverUploading(true);
    try {
      const form = new FormData();
      form.append('file', f);
      const { data } = await api.post('/covers/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      setCoverImage(data.url);
    } catch (err: any) {
      setError(err.response?.data?.message ?? "Erreur d'envoi de la pochette");
    } finally {
      setCoverUploading(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) { setError('Sélectionne un fichier .torrent'); return; }
    if (!categoryId) { setError('Choisis une catégorie'); return; }
    if (isVideoKind) {
      const lacks = [
        defaultKind === 'SERIE' && !season && 'Saison',
        defaultKind === 'SERIE' && !episode && 'Épisode',
        !language && 'Langue',
      ].filter(Boolean) as string[];
      setMissing(lacks);
      if (lacks.length > 0) { setError(`Informations manquantes à remplir à la main : ${lacks.join(', ')}`); return; }
    }
    const form = new FormData();
    form.append('torrentFile', file);
    form.append('name', name);
    form.append('description', description);
    form.append('categoryId', categoryId);
    form.append('tags', tags);
    form.append('anonymous', String(anonymous));
    if (coverImage) form.append('coverImage', coverImage);
    if (meta) { form.append('metaKind', meta.kind); form.append('metaId', meta.id); }
    if (year) form.append('year', year);
    if (language) form.append('language', language);
    if (origin) form.append('origin', origin);
    if (resolution) form.append('resolution', resolution);
    if (codec) form.append('codec', codec);
    form.append('hdr', String(hdr));
    if (audio) form.append('audio', audio);
    if (source) form.append('source', source);
    if (containerFormat) form.append('containerFormat', containerFormat);
    if (fps) form.append('fps', fps);
    if (durationMinutes) form.append('durationMinutes', durationMinutes);
    if (isVideoKind) {
      if (defaultKind === 'SERIE') { form.append('season', season); form.append('episode', episode); }
      if (genres.length) form.append('genres', genres.join(','));
      form.append('videoType', videoType);
    }
    if (nfoText) form.append('nfo', nfoText);
    try {
      const { data } = await api.post('/torrents/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      navigate(`/torrents/${data.id}`, { state: { justUploaded: true } });
    } catch (err: any) {
      setError(err.response?.data?.message ?? "Erreur d'upload");
    }
  }

  return (
    <div className="grid page-narrow">
      <h1>Uploader un torrent</h1>

      <div className="panel ornate">
        <div className="panel-title"><span className="title-icon">📜</span>À savoir avant d'uploader</div>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          <div>
            <strong>Un seul upload par contenu</strong>
            <p className="muted" style={{ margin: '4px 0 0' }}>Vérifie qu'il n'existe pas déjà via Parcourir avant d'envoyer.</p>
          </div>
          <div>
            <strong>Bonne catégorie</strong>
            <p className="muted" style={{ margin: '4px 0 0' }}>Choisis la sous-catégorie la plus précise si elle existe.</p>
          </div>
          <div>
            <strong>Tout est automatique</strong>
            <p className="muted" style={{ margin: '4px 0 0' }}>Choisis ton fichier .torrent et ta catégorie : nom, métadonnées, description et pochette se préremplissent tout seuls. Vérifie avant d'envoyer.</p>
          </div>
          <div>
            <strong>Modération</strong>
            <p className="muted" style={{ margin: '4px 0 0' }}>Ton torrent reste en attente jusqu'à l'approbation du staff.</p>
          </div>
        </div>
      </div>

      <div className="panel">
        <form onSubmit={submit} className="grid">
          <input type="file" accept=".torrent" onChange={onFileChange} required />
          {fileList.length > 0 && (
            <p className="muted" style={{ fontSize: 12, margin: 0 }}>
              🔍 {summary.fileCount} fichier{summary.fileCount > 1 ? 's' : ''} · {summary.totalSizeText}
              {summary.mainFormat && ` · ${summary.mainFormat}`}
              {summary.subtitlesText && ` · sous-titres : ${summary.subtitlesText}`}
              {autoDetected.size > 0 && ` — métadonnées techniques préremplies automatiquement`}
            </p>
          )}
          {fileList.length > 0 && (
            <p className="muted" style={{ fontSize: 12, margin: 0 }}>
              🧹 {foundTrackers.length > 0
                ? `${foundTrackers.length} tracker${foundTrackers.length > 1 ? 's' : ''} externe${foundTrackers.length > 1 ? 's' : ''} détecté${foundTrackers.length > 1 ? 's' : ''} (${foundTrackers.map((t) => { try { return new URL(t).host; } catch { return t; } }).join(', ')}) : ${foundTrackers.length > 1 ? 'ils seront retirés' : 'il sera retiré'}`
                : 'Aucun tracker externe dans ce fichier'}
              {' '}— Seeduction y ajoute automatiquement son announce avec la passkey de chaque membre au téléchargement.
            </p>
          )}
          <input placeholder="Nom" value={name} onChange={(e) => setName(e.target.value)} required />
          <DuplicateWarning name={name} metaId={meta?.id} />
          <div className="row" style={{ gap: 8 }}>
            <select
              value={mainId}
              onChange={(e) => {
                const main = categories.find((c) => c.id === e.target.value);
                setMainId(e.target.value);
                setCategoryId(main && !main.children?.length ? main.id : '');
              }}
              required
              style={{ flex: 1 }}
            >
              <option value="">— Catégorie principale —</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {(categories.find((c) => c.id === mainId)?.children?.length ?? 0) > 0 && (
              <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} required style={{ flex: 1 }}>
                <option value="">— Sous-catégorie —</option>
                {categories.find((c) => c.id === mainId)?.children.map((sub: any) => (
                  <option key={sub.id} value={sub.id}>{sub.name}</option>
                ))}
              </select>
            )}
          </div>

          {isVideoKind && (
            <div className="panel" style={{ background: 'rgba(255,255,255,0.03)' }}>
              <div className="panel-title"><span className="title-icon">🏷️</span>Métadonnées</div>
              <p className="muted" style={{ fontSize: 12, margin: '0 0 10px' }}>
                Remplies automatiquement d'après le nom, la liste des fichiers et le NFO. Complète à la main ce qui reste vide (<span style={{ color: 'var(--danger)' }}>*</span> obligatoire).
              </p>
              <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                {defaultKind === 'SERIE' && (
                  <>
                    <label className="grid" style={{ gap: 4 }}>
                      <span className="muted">Saison <span style={{ color: 'var(--danger)' }}>*</span></span>
                      <select value={season} onChange={(e) => setSeason(e.target.value)} style={missing.includes('Saison') ? { borderColor: 'var(--danger)' } : undefined}>
                        <option value="">Sélectionner…</option>
                        {SEASON_OPTIONS.map((s) => <option key={s} value={s}>{/^\d+$/.test(s) ? `Saison ${s}` : s}</option>)}
                      </select>
                    </label>
                    <label className="grid" style={{ gap: 4 }}>
                      <span className="muted">Épisode <span style={{ color: 'var(--danger)' }}>*</span></span>
                      <select value={episode} onChange={(e) => setEpisode(e.target.value)} style={missing.includes('Épisode') ? { borderColor: 'var(--danger)' } : undefined}>
                        <option value="">Sélectionner…</option>
                        {EPISODE_OPTIONS.map((s) => <option key={s} value={s}>{/^\d+$/.test(s) ? `Épisode ${s}` : s}</option>)}
                      </select>
                    </label>
                  </>
                )}
                <label className="grid" style={{ gap: 4 }}>
                  <span className="muted">Langue <span style={{ color: 'var(--danger)' }}>*</span></span>
                  <select value={language} onChange={(e) => setLanguage(e.target.value)} style={missing.includes('Langue') ? { borderColor: 'var(--danger)' } : undefined}>
                    <option value="">Sélectionner…</option>
                    {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
                  </select>
                </label>
                <div className="grid" style={{ gap: 4 }}>
                  <span className="muted">Genre (plusieurs possibles)</span>
                  <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
                    {GENRES.map((g) => (
                      <button key={g} type="button" className={genres.includes(g) ? '' : 'secondary'} style={{ padding: '3px 10px', fontSize: 12 }}
                        onClick={() => setGenres((cur) => cur.includes(g) ? cur.filter((x) => x !== g) : [...cur, g])}>{g}</button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="grid" style={{ gap: 4, marginTop: 12 }}>
                <span className="muted">Type</span>
                <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                  {VIDEO_TYPES.map((t) => (
                    <button key={t} type="button" className={videoType === t ? '' : 'secondary'} style={{ padding: '4px 14px' }}
                      onClick={() => { videoTouched.current = true; setVideoType(t); }}>{t}</button>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="panel" style={{ background: 'rgba(255,255,255,0.03)' }}>
            <div className="muted" style={{ marginBottom: 6 }}>Fichier NFO (optionnel) — sert à remplir automatiquement les métadonnées</div>
            <input type="file" accept=".nfo,.txt" onChange={onNfoChange} />
            {nfoText && <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>📄 NFO chargé ({nfoText.length.toLocaleString('fr-CA')} caractères) — les champs vides ont été remplis quand c'était possible.</p>}
          </div>

          <DescriptionGenerator
            knownValues={generatorKnownValues}
            defaultKind={defaultKind}
            searchTitle={searchInfo.title}
            searchYear={year || searchInfo.year}
            autoStart={!!file && !!categoryId && !!name.trim()}
            sessionKey={sessionKey}
            currentDescription={description}
            onGenerate={setDescription}
            onCoverChange={setCoverImage}
            onMetaChange={setMeta}
          />

          <div>
            <div className="muted" style={{ marginBottom: 6 }}>Description</div>
            <WysiwygEditor value={description} onChange={setDescription} minHeight={320} />
          </div>

          <div>
            <div className="muted" style={{ marginBottom: 6 }}>Pochette / affiche (optionnelle)</div>
            <div className="row" style={{ alignItems: 'center', gap: 10 }}>
              {coverImage
                ? <img src={coverImage} alt="" style={{ width: 60, height: 84, objectFit: 'cover', borderRadius: 4 }} />
                : <div style={{ width: 60, height: 84, background: 'var(--bg-panel-raised)', borderRadius: 4 }} />}
              <div className="grid" style={{ gap: 6 }}>
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={onCoverFileChange} disabled={coverUploading} />
                {coverImage && (
                  <button type="button" className="secondary" style={{ alignSelf: 'flex-start' }} onClick={() => setCoverImage('')}>
                    Retirer la pochette
                  </button>
                )}
              </div>
            </div>
            <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              Remplie automatiquement en choisissant un résultat dans le générateur ci-dessus, ou envoie ta propre image. Toujours sauvegardée sur Seeduction.
            </p>
          </div>

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
              <select value={origin} onChange={(e) => setOrigin(e.target.value)} title="Pays ou région de production du contenu">
                <option value="">Origine</option>
                {ORIGINS.map((o) => <option key={o} value={o}>{o}</option>)}
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
    </div>
  );
}
