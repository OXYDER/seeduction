import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuthStore } from '../store/auth';
import DescriptionGenerator from '../components/DescriptionGenerator';
import MemberImport from '../components/MemberImport';
import WysiwygEditor from '../components/WysiwygEditor';
import { ORIGINS, RESOLUTIONS, SOURCES, CODECS, AUDIO_FORMATS, CONTAINERS, detectFromReleaseName, cleanTitleForSearch } from '../lib/searchParser';
import { parseTorrentInfo } from '../lib/bencode';
import { summarizeTorrent } from '../lib/torrentSummary';
import { resolveContentKind } from '../lib/categoryKind';
import DuplicateWarning from '../components/DuplicateWarning';
import FacetFields from '../components/FacetFields';
import GamePlatformPicker, { type GamePlatformInfo } from '../components/GamePlatformPicker';
import type { FacetDef, FacetValues } from '../lib/facets';
import { LANGUAGE_GROUPS, LANGUAGE_LABELS, languageTagFrom } from '../lib/languageTag';
import { GENRES, VIDEO_TYPES, SEASON_OPTIONS, EPISODE_OPTIONS, parseNfo, detectEpisodeFromRelease, detectVideoType, matchGenres, looksLikeCode, titleFromNfo } from '../lib/uploadMeta';

/** Envoyer : un seul torrent (formulaire complet) ou plusieurs d'un coup depuis son propre client (qBittorrent + FTP), avec confirmation ligne par ligne. */
export default function Upload() {
  const [mode, setMode] = useState<'one' | 'many'>(() => { try { return localStorage.getItem('upload-mode') === 'many' ? 'many' : 'one'; } catch { return 'one'; } });
  const pick = (m: 'one' | 'many') => { setMode(m); try { localStorage.setItem('upload-mode', m); } catch { /* préférence facultative */ } };
  return (
    <div className="grid" style={{ gap: 14 }}>
      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
        <button type="button" className={mode === 'one' ? 'on' : 'secondary'} onClick={() => pick('one')}>📄 Un seul torrent</button>
        <button type="button" className={mode === 'many' ? 'on' : 'secondary'} onClick={() => pick('many')}>📦 Plusieurs torrents (depuis mon client)</button>
      </div>
      {mode === 'one' ? <UploadOne /> : <><h1 style={{ margin: 0 }}>Envoyer plusieurs torrents</h1><MemberImport /></>}
    </div>
  );
}

function UploadOne() {
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
  const langTouched = useRef(false); // l'étiquette choisie à la main n'est plus jamais remplacée par la détection automatique
  const pickLanguage = (v: string) => { langTouched.current = true; setLanguage(v); };
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
  const [nfoMissing, setNfoMissing] = useState(false);
  const [missing, setMissing] = useState<string[]>([]);
  const [editing, setEditing] = useState<Set<string>>(new Set());
  const [autoDetected, setAutoDetected] = useState<Set<string>>(new Set());
  const [fileList, setFileList] = useState<{ path: string; size: number }[]>([]);
  const [foundTrackers, setFoundTrackers] = useState<string[]>([]);
  const [coverImage, setCoverImage] = useState('');
  const [meta, setMeta] = useState<{ kind: string; id: string } | null>(null);
  const [coverUploading, setCoverUploading] = useState(false);
  const autoName = useRef('');
  const [sessionKey, setSessionKey] = useState('');
  // Filtres propres à la catégorie (format audio, console, genre...) : trouvés automatiquement, corrigeables d'un clic.
  const [facetDefs, setFacetDefs] = useState<FacetDef[]>([]);
  const [facetValues, setFacetValues] = useState<FacetValues>({});
  const [facetFound, setFacetFound] = useState<Set<string>>(new Set());
  const facetTouched = useRef<Set<string>>(new Set());
  const [metaGenres, setMetaGenres] = useState<string[]>([]);
  // Jeux : plateforme choisie (Windows, Switch, PS5...) et celles de la fiche RAWG ; elle règle la sous-catégorie et le filtre de console.
  const [platformId, setPlatformId] = useState<string | null>(null);
  const platformChoice = useRef<GamePlatformInfo | null>(null);
  const [fichePlatforms, setFichePlatforms] = useState('');

  const selectedCategory = categories.flatMap((c) => [c, ...(c.children ?? [])]).find((c) => c.id === categoryId);
  // Le type de contenu du générateur vient de la catégorie choisie (configuré dans
  // Administration > Catégories torrents), avec repli sur la catégorie parente —
  // l'uploader n'a plus à le choisir lui-même.
  const parentCategory = categories.find((c) => c.children?.some((sub: any) => sub.id === categoryId));
  const defaultKind = resolveContentKind(selectedCategory, parentCategory);
  const isVideoKind = defaultKind === 'FILM' || defaultKind === 'SERIE';
  // Étapes : chacune n'est accessible qu'une fois la précédente terminée.
  const step1 = !!file && !!name.trim();
  const step2 = step1 && !!categoryId;
  const step3 = step2 && (!isVideoKind || (!!language && (defaultKind !== 'SERIE' || (!!season && !!episode))));
  const step4 = step3 && description.trim().length > 0;

  /** Une fiche choisie dans le générateur remplit les genres et l'année si rien n'a été trouvé avant. */
  function onGeneratorDetail(data: Record<string, any>) {
    if (typeof data.plateformes === 'string') setFichePlatforms(data.plateformes);
    if (typeof data.genre === 'string' && data.genre) {
      setMetaGenres(data.genre.split(/[,/;|]+/).map((g: string) => g.trim()).filter(Boolean));
      const found = matchGenres(data.genre);
      if (found.length > 0) setGenres((cur) => (cur.length > 0 ? cur : found));
    }
    const y = typeof data['année'] === 'string' ? data['année'].match(/\d{4}/)?.[0] : undefined;
    if (y) setYear((cur) => cur || y);
  }
  const mainCategory = categories.find((c) => c.id === mainId);
  const isGamesMain = (mainCategory?.name ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().startsWith('jeux video');
  const pickPlatform = useCallback((p: GamePlatformInfo, auto: boolean) => {
    const sub = mainCategory?.children?.find((c: any) => c.name === p.category);
    if (!sub) return;
    platformChoice.current = p;
    setPlatformId(p.id);
    if (!auto || !categoryId) setCategoryId(sub.id);
  }, [mainCategory, categoryId]);
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
    sous_titres: summary.subtitlesText || (language.includes('VOSTFR') ? 'Français' : ''),
    // Tiré directement du contenu du .torrent (jamais la taille du fichier .torrent lui-même).
    taille: fileList.length > 0 ? summary.totalSizeText : '',
    nb_fichiers: fileList.length > 0 ? String(summary.fileCount) : '',
    fichiers: summary.filesText,
  };

  useEffect(() => {
    api.get('/categories').then((r) => setCategories(r.data));
  }, []);

  useEffect(() => { platformChoice.current = null; setPlatformId(null); setFichePlatforms(''); }, [mainId]);

  // Changer de catégorie repart de zéro : ce n'est plus la même liste de filtres.
  useEffect(() => { facetTouched.current = new Set(); setFacetValues({}); setFacetFound(new Set()); setFacetDefs([]); }, [categoryId]);

  // Le serveur lit le nom, les fichiers, le NFO et les genres de la fiche, et renvoie les filtres de la catégorie avec ce qu'il a trouvé.
  useEffect(() => {
    if (!categoryId || !name.trim()) return;
    const t = setTimeout(() => {
      api.post('/torrents/analyze', { categoryId, name, files: fileList.slice(0, 400), nfo: nfoText || undefined, genres: [...genres, ...metaGenres] })
        .then((r) => {
          const defs: FacetDef[] = r.data.facets ?? [];
          const detected: FacetValues = r.data.detected ?? {};
          setFacetDefs(defs);
          setFacetValues((cur) => {
            const next: FacetValues = {};
            for (const d of defs) next[d.key] = facetTouched.current.has(d.key) ? cur[d.key] ?? [] : detected[d.key] ?? cur[d.key] ?? [];
            // La plateforme choisie (Switch, PS5...) prime sur la détection.
            const pc = platformChoice.current;
            if (pc?.facetKey && pc.facetValue && defs.some((d) => d.key === pc.facetKey)) { next[pc.facetKey] = [pc.facetValue]; facetTouched.current.add(pc.facetKey); }
            return next;
          });
          setFacetFound(new Set(Object.keys(detected)));
        })
        .catch(() => {});
    }, 500);
    return () => clearTimeout(t);
  }, [categoryId, name, fileList, nfoText, genres, metaGenres]);

  // Remplissage automatique (nom, fichiers, NFO) : ne touche jamais à un champ déjà rempli.
  useEffect(() => {
    const text = [name, ...fileList.slice(0, 60).map((f) => f.path)].join(' ');
    const ep = detectEpisodeFromRelease(name, fileList.map((f) => f.path));
    const nfo = parseNfo(nfoText);
    if (!season && (ep.season ?? nfo.season)) setSeason((ep.season ?? nfo.season) as string);
    if (!episode && (ep.episode ?? nfo.episode)) setEpisode((ep.episode ?? nfo.episode) as string);
    const langTag = languageTagFrom(name, nfoText); // nom + MediaInfo : VFQ, MULTI.VFQ, MULTI.VF2, VOSTFR...
    if (langTag && !langTouched.current) setLanguage(langTag);
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

  // Toujours un code comme nom, mais un NFO arrive : son titre remplace le code, et la recherche de fiche repart avec.
  useEffect(() => {
    if (!nfoText || name !== autoName.current || !looksLikeCode(name)) return;
    const t = titleFromNfo(nfoText);
    if (!t) return;
    setName(t);
    autoName.current = t;
    setSessionKey((k) => `${k}:nfo`);
  }, [nfoText, name]);

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
      // Un nom interne qui n'est qu'un code (dossier d'une image de console : « GGSPA4 ») ne sert à rien : on prend le nom du fichier .torrent.
      let shownName = parsed.name;
      if (looksLikeCode(shownName)) {
        const fromFile = f.name.replace(/\.torrent$/i, '').trim();
        if (fromFile.length >= 6 && !looksLikeCode(fromFile)) shownName = fromFile;
      }
      if (!name.trim() || name === autoName.current) { setName(shownName); autoName.current = shownName; }

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
    if (nfoText.replace(/\s+/g, ' ').trim().length < 20) {
      setNfoMissing(true);
      setError('Le NFO ou le MediaInfo est obligatoire : ajoute le fichier .nfo ou colle le texte du MediaInfo.');
      return;
    }
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
    if (Object.values(facetValues).some((v) => v.length)) form.append('attrs', JSON.stringify(facetValues));
    try {
      const { data } = await api.post('/torrents/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      navigate(`/torrents/${data.id}`, { state: { justUploaded: true } });
    } catch (err: any) {
      setError(err.response?.data?.message ?? "Erreur d'upload");
    }
  }

  return (
    <div className="grid">
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
          <Step n={1} title="Fichier torrent" done={step1} locked={false}>
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
            <div className="grid" style={{ gap: 6 }}>
              <div className="muted"><strong style={{ color: nfoMissing && nfoText.trim().length < 20 ? 'var(--danger)' : undefined }}>NFO ou MediaInfo (obligatoire)</strong> — décrit la release et remplit automatiquement les métadonnées</div>
              <input type="file" accept=".nfo,.txt" onChange={onNfoChange} />
              <textarea rows={nfoText ? 5 : 2} placeholder="…ou colle ici le texte du NFO ou de MediaInfo" value={nfoText} onChange={(e) => setNfoText(e.target.value.slice(0, 200_000))} style={{ fontFamily: 'Consolas, monospace', fontSize: 12, ...(nfoMissing && nfoText.trim().length < 20 ? { borderColor: 'var(--danger)' } : {}) }} />
            </div>
          <input placeholder="Nom" value={name} onChange={(e) => setName(e.target.value)} required />
          <DuplicateWarning name={name} metaId={meta?.id} />
          </Step>

          <Step n={2} title="Catégorie" done={step2} locked={!step1} hint="Termine l'étape 1 (fichier torrent et nom).">
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
          {isGamesMain && (
            <GamePlatformPicker
              name={name}
              files={fileList}
              nfo={nfoText}
              fichePlatforms={fichePlatforms}
              selectedId={platformId && mainCategory?.children?.find((c: any) => c.id === categoryId)?.name === (platformChoice.current?.category) ? platformId : null}
              onPick={pickPlatform}
            />
          )}

          </Step>

          <Step n={3} title="Métadonnées" done={step3} locked={!step2} hint="Choisis d'abord la catégorie.">
          <DescriptionGenerator
            knownValues={generatorKnownValues}
            defaultKind={defaultKind}
            searchTitle={searchInfo.title}
            searchYear={year || searchInfo.year}
            autoStart={!!file && !!categoryId && !!name.trim()}
            sessionKey={sessionKey}
            refreshKey={`${categoryId}|${searchInfo.title}|${year}|${nfoText.length}:${nfoText.slice(0, 40)}`}
            currentDescription={description}
            onGenerate={setDescription}
            onCoverChange={setCoverImage}
            onMetaChange={setMeta}
            onDetail={onGeneratorDetail}
          />
            {isVideoKind && (
              <div className="grid" style={{ gap: 10 }}>
                <p className="muted" style={{ fontSize: 12, margin: 0 }}>
                  Remplies automatiquement d'après le nom, les fichiers, le NFO et la fiche choisie ci-dessus. Seules les informations introuvables sont à saisir (<span style={{ color: 'var(--danger)' }}>*</span> obligatoire).
                </p>
                <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, alignItems: 'start' }}>
                  {defaultKind === 'SERIE' && (
                    <>
                      <FoundOrInput id="season" label="Saison" required filled={!!season} summary={/^\d+$/.test(season) ? `Saison ${season}` : season} editing={editing} setEditing={setEditing} missing={missing.includes('Saison')}>
                        <select value={season} onChange={(e) => setSeason(e.target.value)}>
                          <option value="">Sélectionner…</option>
                          {SEASON_OPTIONS.map((x) => <option key={x} value={x}>{/^\d+$/.test(x) ? `Saison ${x}` : x}</option>)}
                        </select>
                      </FoundOrInput>
                      <FoundOrInput id="episode" label="Épisode" required filled={!!episode} summary={/^\d+$/.test(episode) ? `Épisode ${episode}` : episode} editing={editing} setEditing={setEditing} missing={missing.includes('Épisode')}>
                        <select value={episode} onChange={(e) => setEpisode(e.target.value)}>
                          <option value="">Sélectionner…</option>
                          {EPISODE_OPTIONS.map((x) => <option key={x} value={x}>{/^\d+$/.test(x) ? `Épisode ${x}` : x}</option>)}
                        </select>
                      </FoundOrInput>
                    </>
                  )}
                  <FoundOrInput id="language" label="Langue" required filled={!!language} summary={language} editing={editing} setEditing={setEditing} missing={missing.includes('Langue')}>
                    <select value={language} onChange={(e) => pickLanguage(e.target.value)} title="Langue des pistes audio, selon la règle de Seeduction">
                      <option value="">Sélectionner…</option>
                      {LANGUAGE_GROUPS.map((g) => <optgroup key={g.label} label={g.label}>{g.values.map((l) => <option key={l} value={l}>{LANGUAGE_LABELS[l] ?? l}</option>)}</optgroup>)}
                    </select>
                  </FoundOrInput>
                  <FoundOrInput id="type" label="Type" filled={!!videoType && (videoTouched.current || videoType !== '2D')} summary={videoType} editing={editing} setEditing={setEditing}>
                    <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                      {VIDEO_TYPES.map((t) => (
                        <button key={t} type="button" className={videoType === t ? '' : 'secondary'} style={{ padding: '4px 14px' }}
                          onClick={() => { videoTouched.current = true; setVideoType(t); }}>{t}</button>
                      ))}
                    </div>
                  </FoundOrInput>
                  <FoundOrInput id="genres" label="Genre" filled={genres.length > 0} summary={genres.join(', ')} editing={editing} setEditing={setEditing}>
                    <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
                      {GENRES.map((g) => (
                        <button key={g} type="button" className={genres.includes(g) ? '' : 'secondary'} style={{ padding: '3px 10px', fontSize: 12 }}
                          onClick={() => setGenres((cur) => cur.includes(g) ? cur.filter((x) => x !== g) : [...cur, g])}>{g}</button>
                      ))}
                    </div>
                  </FoundOrInput>
                </div>
              </div>
            )}
            {facetDefs.length > 0 && (
              <div className="grid" style={{ gap: 10 }}>
                <p className="muted" style={{ fontSize: 12, margin: 0 }}>
                  <strong>Détails de « {selectedCategory?.name} »</strong> — trouvés automatiquement d'après le nom, les fichiers, le NFO et la fiche choisie. Corrige ou complète d'un clic : ils servent de filtres sur Parcourir.
                </p>
                <FacetFields
                  defs={facetDefs}
                  values={facetValues}
                  found={facetFound}
                  onChange={(key, next) => { facetTouched.current.add(key); setFacetValues((cur) => ({ ...cur, [key]: next })); }}
                />
              </div>
            )}
          <button type="button" className="secondary" style={{ alignSelf: 'flex-start' }} onClick={() => setShowMeta((v) => !v)}>
            {showMeta ? 'Masquer' : '+ Métadonnées techniques (optionnel)'}
          </button>
          {showMeta && (
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8 }}>
              <input type="number" placeholder="Année" value={year} onChange={(e) => setYear(e.target.value)} />
              <select value={language} onChange={(e) => pickLanguage(e.target.value)} title="Langue des pistes audio, selon la règle de Seeduction">
                <option value="">Langue</option>
                {LANGUAGE_GROUPS.map((g) => <optgroup key={g.label} label={g.label}>{g.values.map((l) => <option key={l} value={l}>{LANGUAGE_LABELS[l] ?? l}</option>)}</optgroup>)}
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

          </Step>

          <Step n={4} title="Description et pochette" done={step4} locked={!step3} hint="Complète les métadonnées à l'étape 3.">
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
          </Step>

          <Step n={5} title="Envoi" done={false} locked={!step4} hint="Ajoute une description à l'étape 4.">
          <label className="row"><input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} style={{ width: 'auto' }} /> Upload anonyme</label>
            {error && <div style={{ color: 'var(--danger)' }} className="muted">{error}</div>}
            <button type="submit" disabled={!step4}>Uploader</button>
          </Step>
        </form>
      </div>
    </div>
  );
}

const STEP_STYLE_LOCKED = { opacity: 0.4, pointerEvents: 'none' as const, filter: 'grayscale(0.4)' };

/** Une étape du formulaire : verrouillée tant que la précédente n'est pas terminée. */
function Step({ n, title, done, locked, hint, children }: { n: number; title: string; done: boolean; locked: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div className="panel" style={{ background: 'rgba(255,255,255,0.03)', position: 'relative' }}>
      <div className="row" style={{ alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <span style={{
          width: 28, height: 28, borderRadius: '50%', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 14, flexShrink: 0,
          background: done ? 'var(--success)' : locked ? 'rgba(255,255,255,0.12)' : 'linear-gradient(135deg, var(--acc1, var(--gold)), var(--acc2, var(--gold-bright)))', color: '#fff',
        }}>{done ? '✓' : n}</span>
        <strong style={{ fontSize: 16 }}>Étape {n} — {title}</strong>
        {locked && <span className="muted" style={{ fontSize: 12 }}>🔒 {hint}</span>}
      </div>
      <div className="grid" style={{ gap: 12, ...(locked ? STEP_STYLE_LOCKED : {}) }} aria-disabled={locked}>{children}</div>
    </div>
  );
}

/** Valeur trouvée automatiquement (affichée en résumé, modifiable) ou champ à saisir si rien n'a été trouvé. */
function FoundOrInput({ id, label, required, filled, summary, editing, setEditing, missing, children }: {
  id: string; label: string; required?: boolean; filled: boolean; summary: string; editing: Set<string>; setEditing: (f: (s: Set<string>) => Set<string>) => void; missing?: boolean; children: React.ReactNode;
}) {
  const isEditing = editing.has(id);
  const toggle = () => setEditing((cur) => { const next = new Set(cur); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  if (filled && !isEditing) {
    return (
      <div className="grid" style={{ gap: 2 }}>
        <span className="muted">{label}</span>
        <div className="row" style={{ alignItems: 'center', gap: 8 }}>
          <span style={{ color: 'var(--success)' }}>✓</span> <strong>{summary}</strong>
          <button type="button" className="secondary" style={{ padding: '2px 10px', fontSize: 12 }} onClick={toggle}>Modifier</button>
        </div>
      </div>
    );
  }
  return (
    <div className="grid" style={{ gap: 4, ...(missing ? { outline: '1px solid var(--danger)', outlineOffset: 4, borderRadius: 6 } : {}) }}>
      <span className="muted">{label} {required && <span style={{ color: 'var(--danger)' }}>*</span>}</span>
      {children}
      {filled && <button type="button" className="secondary" style={{ alignSelf: 'flex-start', padding: '2px 10px', fontSize: 12 }} onClick={toggle}>OK</button>}
    </div>
  );
}
