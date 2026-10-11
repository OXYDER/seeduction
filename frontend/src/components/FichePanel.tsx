import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { cleanTitleForSearch } from '../lib/searchParser';
import { resolveContentKind } from '../lib/categoryKind';

const KIND_LABEL: Record<string, string> = { FILM: 'Film (TMDB)', SERIE: 'Série (TMDB)', MUSIQUE: 'Musique (Deezer)', LIVRE: 'Livre', JEU: 'Jeu (RAWG)', XXX: 'XXX (ThePornDB)' };

/** Type de fiche d'un torrent d'après sa source (TMDB : film ou série selon la fiche). */
function ficheKind(t: any): string | null {
  if (t.metaSource === 'tmdb') return t.metadata?.kind === 'tv' ? 'SERIE' : 'FILM';
  if (t.metaSource === 'deezer') return 'MUSIQUE';
  if (t.metaSource === 'google-books' || t.metaSource === 'openlibrary') return 'LIVRE';
  if (t.metaSource === 'rawg') return 'JEU';
  return null;
}

const STOP = /^(S\d{1,2}(E\d{1,3})?|saison\d*|\d{3,4}[pi]|multi\d?|french|truefrench|vff|vfq|vfi|vf2|vostfr|web|webrip|web-dl|bluray|remux|hdtv|x26[45]|h26[45])$/i;

/** Titre cherchable tiré d'un nom de release : « Occupation.Double.Panama.S10E34.FRENCH… » → « Occupation Double Panama ». */
function guessTitle(name: string): { title: string; year: string } {
  const words = name.replace(/\.(mkv|mp4|avi|torrent)$/i, '').split(/[.\s_]+/).filter(Boolean);
  const kept: string[] = [];
  let year = '';
  for (const w of words) {
    if (/^(19|20)\d{2}$/.test(w) && kept.length) { year = w; break; }
    if (kept.length && STOP.test(w.split('-')[0])) break;
    kept.push(w);
  }
  return { title: kept.join(' '), year };
}

/** Type de fiche à chercher quand le torrent n'en a pas : celui de sa catégorie, sinon série si le nom porte une saison / un épisode, sinon film. */
function guessKind(t: any): string {
  const ck = String(resolveContentKind(t.category, t.category?.parent) ?? '').toUpperCase();
  if (KIND_LABEL[ck]) return ck;
  if (t.season || /\bS\d{1,2}(E\d{1,3})?\b/i.test(t.name ?? '')) return 'SERIE';
  return 'FILM';
}

/**
 * Changer ou retirer la fiche (TMDB, Deezer, livres, jeux) d'un torrent déjà sur le site : la fiche automatique n'est pas toujours la bonne.
 * Chercher par titre, ou coller l'adresse de la fiche TMDB ; l'ancienne fiche (acteurs, studios, genres, fond) est remplacée par la nouvelle.
 */
export default function FichePanel({ torrent, onChanged, base = '/admin/torrents' }: { torrent: any; onChanged: (patch: any) => void; base?: string }) {
  const current = ficheKind(torrent);
  // Le titre cherché vient du NOM de la release (la fiche actuelle est peut-être la mauvaise).
  const cleaned = cleanTitleForSearch(torrent.name);
  const guess = { title: cleaned.title || guessTitle(torrent.name).title, year: cleaned.year ?? guessTitle(torrent.name).year };
  const [kinds, setKinds] = useState<string[]>([]);
  const [kind, setKind] = useState<string>(current ?? guessKind(torrent));
  const [q, setQ] = useState<string>(guess.title);
  const [year, setYear] = useState(guess.year);
  const [results, setResults] = useState<{ id: string; title: string; subtitle: string; thumbnail: string | null }[]>([]);
  const [searched, setSearched] = useState(false);
  const [searchedFor, setSearchedFor] = useState('');
  const [note, setNote] = useState('');
  const [pick, setPick] = useState<{ kind: string; id: string; title: string } | null>(null);
  const [link, setLink] = useState('');
  const [replaceCover, setReplaceCover] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => { api.get('/metadata/kinds').then((r) => setKinds((r.data as string[]).filter((k) => KIND_LABEL[k]))).catch(() => undefined); }, []);

  /**
   * Cherche la fiche. Sans résultat avec l'année, on réessaie sans l'année (elle est parfois décalée d'un an entre la release et la base).
   * `from` : titre / année / type à utiliser à la place des champs (recherche automatique à l'ouverture, changement de type).
   */
  async function search(from?: { q?: string; year?: string; kind?: string }) {
    const query = (from?.q ?? q).trim();
    const y = from?.year ?? year;
    const k = from?.kind ?? kind;
    if (!query) return;
    setBusy(true); setErr(''); setNote('');
    try {
      let r = await api.get('/metadata/search', { params: { kind: k, query, year: y || undefined } });
      let list = r.data as typeof results;
      if (list.length === 0 && y) {
        r = await api.get('/metadata/search', { params: { kind: k, query } });
        list = r.data;
        if (list.length > 0) { setYear(''); setNote(`Aucun résultat pour l'année ${y} : résultats sans l'année.`); }
      }
      setResults(list); setSearched(true); setSearchedFor(query);
    }
    catch (e: any) { setErr(e.response?.data?.message ?? 'Recherche impossible'); }
    finally { setBusy(false); }
  }

  // La recherche se lance toute seule à l'ouverture, d'après le nom du torrent ; le membre peut ensuite en refaire une autre (titre, année, type).
  const auto = useRef(false);
  useEffect(() => { if (auto.current) return; auto.current = true; void search(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  // Changer de type de fiche (film, série, musique...) relance la recherche.
  function changeKind(k: string) { setKind(k); setPick(null); void search({ kind: k }); }
  function useLink(v: string) {
    setLink(v);
    const m = v.match(/themoviedb\.org\/(movie|tv)\/(\d+)/i);
    if (m) { const k = m[1].toLowerCase() === 'tv' ? 'SERIE' : 'FILM'; setKind(k); setPick({ kind: k, id: m[2], title: `TMDB n° ${m[2]}` }); }
  }
  /** Recharge la fiche du torrent (puis une 2e fois : les images se téléchargent en arrière-plan). */
  async function refresh() {
    for (const wait of [0, 5000]) {
      if (wait) await new Promise((r) => setTimeout(r, wait));
      try { const { data } = await api.get(`/torrents/${torrent.id}`); onChanged(data); } catch { /* la tentative suivante suffira */ }
    }
  }
  async function apply() {
    if (!pick) return;
    setBusy(true); setErr(''); setMsg('');
    try {
      await api.post(`${base}/${torrent.id}/metadata`, { kind: pick.kind, id: pick.id, replaceCover });
      setMsg(`✓ Fiche remplacée par « ${pick.title} »`);
      setPick(null);
      void refresh();
    } catch (e: any) { setErr(e.response?.data?.message ?? 'Remplacement impossible'); }
    finally { setBusy(false); }
  }
  async function clear() {
    if (!window.confirm('Retirer la fiche de ce torrent ? Les acteurs, studios, genres et le fond liés sont supprimés (la pochette est gardée).')) return;
    setBusy(true); setErr(''); setMsg('');
    try { await api.delete(`${base}/${torrent.id}/metadata`); setMsg('✓ Fiche retirée'); void refresh(); }
    catch (e: any) { setErr(e.response?.data?.message ?? 'Suppression impossible'); }
    finally { setBusy(false); }
  }

  const tmdbUrl = torrent.metaSource === 'tmdb' && torrent.metaExternalId ? `https://www.themoviedb.org/${current === 'SERIE' ? 'tv' : 'movie'}/${torrent.metaExternalId}` : null;
  return (
    <div className="panel" style={{ padding: 10 }}>
      <div className="muted" style={{ marginBottom: 6 }}>Fiche (métadonnées : affiche, synopsis, distribution, genres…)</div>
      <div style={{ fontSize: 13, marginBottom: 8 }}>
        {torrent.metaSource
          ? <>Fiche actuelle : <strong>{torrent.metadata?.originalTitle ?? torrent.metaExternalId}</strong> <span className="muted">({torrent.metaSource} n° {torrent.metaExternalId})</span>{tmdbUrl && <> · <a href={tmdbUrl} target="_blank" rel="noopener noreferrer">voir sur TMDB ↗</a></>}</>
          : <span className="muted">Aucune fiche rattachée.</span>}
      </div>
      <div className="row" style={{ gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={kind} onChange={(e) => changeKind(e.target.value)} style={{ width: 'auto' }}>
          {(kinds.length ? kinds : ['FILM', 'SERIE']).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
        </select>
        <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void search(); } }} placeholder="Titre à chercher" style={{ flex: '1 1 220px' }} />
        <input value={year} onChange={(e) => setYear(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="Année" style={{ width: 80 }} />
        <button type="button" className="secondary" disabled={busy || !q.trim()} onClick={() => void search()}>{busy ? 'Recherche…' : '🔎 Chercher'}</button>
      </div>
      <input value={link} onChange={(e) => useLink(e.target.value)} placeholder="…ou colle l'adresse de la fiche TMDB (https://www.themoviedb.org/movie/…)" style={{ width: '100%', marginTop: 6 }} />
      {busy && !searched && <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Recherche automatique de la fiche d'après le nom du torrent…</div>}
      {searched && results.length > 0 && <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>{results.length} résultat{results.length > 1 ? 's' : ''} pour « {searchedFor} ». Ce n'est pas la bonne ? Change le titre, l'année ou le type ci-dessus et relance la recherche.</div>}
      {note && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{note}</div>}
      {searched && results.length === 0 && <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Aucun résultat pour « {searchedFor} » : essaie un autre titre (titre original, sans sous-titre), un autre type de fiche ou sans l'année.</div>}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 6, marginTop: 6 }}>
        {results.map((r) => {
          const on = pick?.id === r.id && pick.kind === kind;
          return (
            <button key={r.id} type="button" className="secondary" onClick={() => setPick({ kind, id: r.id, title: r.title })}
              style={{ display: 'flex', gap: 8, textAlign: 'left', alignItems: 'center', padding: 6, outline: on ? '2px solid var(--success)' : undefined }}>
              {r.thumbnail ? <img src={r.thumbnail} alt="" loading="lazy" style={{ width: 40, height: 58, objectFit: 'cover', borderRadius: 3 }} /> : <div style={{ width: 40, height: 58 }} />}
              <span style={{ fontSize: 12 }}><strong>{r.title}</strong><span className="muted" style={{ display: 'block' }}>{r.subtitle}</span></span>
            </button>
          );
        })}
      </div>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginTop: 8, alignItems: 'center' }}>
        <label className="row muted" style={{ gap: 6, fontSize: 12 }}><input type="checkbox" style={{ width: 'auto' }} checked={replaceCover} onChange={(e) => setReplaceCover(e.target.checked)} /> Remplacer aussi la pochette par l'affiche de la fiche</label>
        {pick && <span style={{ fontSize: 12, color: 'var(--success)' }}>fiche choisie : {pick.title}</span>}
        <span style={{ flex: 1 }} />
        <button type="button" disabled={busy || !pick} onClick={apply}>✓ Appliquer cette fiche</button>
        {torrent.metaSource && <button type="button" className="secondary" disabled={busy} onClick={clear}>Retirer la fiche</button>}
      </div>
      {err && <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 6 }}>{err}</div>}
      {msg && <div style={{ color: 'var(--success)', fontSize: 12, marginTop: 6 }}>{msg}</div>}
    </div>
  );
}
