import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { formatBytes } from '../lib/format';
import { timeAgo } from '../lib/time';
import { downloadTorrent } from '../lib/download';
import { formatMinutes } from '../lib/entityLabels';
import { CATEGORY_STYLE } from './Layout';
import CategoryTag from './CategoryTag';
import UserLink from './UserLink';
import CopyButton from './CopyButton';
import MetaChips from './MetaChips';

const RES_RANK = (r?: string | null) => (!r ? 0 : /^(4k|2160)/i.test(r) ? 5 : /1080/.test(r) ? 4 : /720/.test(r) ? 3 : /576|480/.test(r) ? 2 : 1);

const QUALITY_TOKEN = /^(?:(?:19|20)\d{2}|\d{3,4}p|4k|uhd|hdr\d*|dv|bluray|blu-ray|bdrip|brrip|web-?dl|web-?rip|webrip|hdtv|dvdrip|cam|multi|vff|vfq|vf2|vfi|vostfr|truefrench|french|subfrench|x26[45]|h26[45]|hevc|avc|remux|s\d{1,2}(?:e\d{1,3})?|e\d{1,3}|cd-?rip|flac|mp3|v\d+(?:\.\d+)+)$/i;

/** Titre « propre » d'une release : le nom jusqu'au premier tag de qualité / d'année (« The.Family.Plan.2.2025.1080p… » → « The Family Plan 2 »). */
export function releaseTitle(name: string): string {
  const parts = name.replace(/\.(mkv|mp4|avi|iso|zip|rar)$/i, '').split(/[.\s_]+/).filter(Boolean);
  const out: string[] = [];
  for (const p of parts) {
    if (out.length > 0 && QUALITY_TOKEN.test(p)) break;
    out.push(p);
  }
  const title = out.join(' ').trim();
  return title.length >= 2 ? title : name;
}

const GENERIC_GROUPS = new Set(['notag', 'nogrp', 'nogroup', 'unknown', 'scene', 'p2p', 'repack', 'proper', 'internal', 'readnfo']);
const TECH_TAGS = /^(?:\d{3,4}p|x26[45]|h26[45]|hevc|avc|aac|ac3|eac3|dts|flac|mp3|web|webdl|webrip|bluray|bdrip|hdtv|dvdrip|multi|vff|vfq|vf2|vfi|vostfr|truefrench|french|remux|hdr|hdr10|dv|uhd|sdr|atmos)$/i;

/** Équipe de release : ce qui suit le dernier tiret du nom (« …x264-TOXIC » → TOXIC) — même règle que le serveur, qui en fait une team. */
export function releaseGroup(name: string): string | null {
  const base = name.replace(/\[[^\]]*\]\s*$/, '').replace(/\.(mkv|mp4|avi|iso|zip|rar|torrent|nfo)$/i, '').trim();
  const m = /-([A-Za-z0-9][A-Za-z0-9_]{1,19})$/.exec(base);
  if (!m) return null;
  const g = m[1];
  return /^\d+$/.test(g) || GENERIC_GROUPS.has(g.toLowerCase()) || TECH_TAGS.test(g) ? null : g;
}
const teamSlug = (g: string) => g.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/** Clé de regroupement : la même fiche (TMDB, Deezer...) si elle est connue, sinon le titre nettoyé de la release. */
export function groupKey(t: any): string {
  if (t.groupKey) return t.groupKey; // fourni par le serveur (vue « Groupé » complète)
  if (t.metaSource && t.metaExternalId) return `m:${t.metaSource}:${t.metaExternalId}`;
  return `t:${releaseTitle(t.name).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')}|${t.category?.slug ?? ''}`;
}

const catIcon = (t: any) => (CATEGORY_STYLE[t.category?.slug ?? ''] ?? CATEGORY_STYLE[t.category?.parent?.slug ?? ''])?.icon ?? '📦';
const comments = (t: any) => t._count?.comments ?? 0;

// ---------------------------------------------------------------- séries : saisons complètes / épisodes

const digits = (v?: string | null) => { const m = /(\d+)/.exec(String(v ?? '')); return m ? parseInt(m[1], 10) : 0; };
/** Une release de série qui couvre toute une saison (« Saison complète », « Intégrale » ou pas d'épisode indiqué) plutôt qu'un seul épisode. */
const isPack = (t: any) => !t.episode || /compl|int[ée]grale|pack|saison|season/i.test(String(t.episode)) || !/\d/.test(String(t.episode));

function Aggregate({ rows }: { rows: any[] }) {
  const sizes = rows.map((r) => Number(r.size) || 0);
  const seeds = rows.map((r) => r.seeders ?? 0);
  const leech = rows.map((r) => r.leechers ?? 0);
  const rng = (n: number[]) => (n.length === 0 ? '0' : Math.min(...n) === Math.max(...n) ? String(n[0]) : `${Math.min(...n)}-${Math.max(...n)}`);
  const size = Math.min(...sizes) === Math.max(...sizes) ? formatBytes(sizes[0]) : `${formatBytes(Math.min(...sizes))}-${formatBytes(Math.max(...sizes))}`;
  const newest = rows.reduce((a, b) => (new Date(a.createdAt) > new Date(b.createdAt) ? a : b));
  return (
    <>
      <span className="vr-num vr-cm" title="Commentaires">{rows.reduce((n, r) => n + comments(r), 0)}</span>
      <span className="vr-num vr-age">{timeAgo(newest.createdAt)}</span>
      <span className="vr-num vr-size" title="Taille minimale - maximale">{size}</span>
      <span className="vr-num" title="Téléchargements complétés">{rows.reduce((n, r) => n + (r.completedCount ?? 0), 0)}</span>
      <span className="vr-num vr-seed" title="Seeders (minimum - maximum)">{rng(seeds)}</span>
      <span className="vr-num vr-leech" title="Leechers (minimum - maximum)">{rng(leech)}</span>
    </>
  );
}

const resCounts = (rows: any[]) => {
  const m = new Map<string, number>();
  rows.forEach((r) => r.resolution && m.set(r.resolution, (m.get(r.resolution) ?? 0) + 1));
  return [...m.entries()].sort((a, b) => RES_RANK(b[0]) - RES_RANK(a[0]));
};

interface RowProps { t: any; current?: boolean; /** Release seule (sans titre de groupe au-dessus) : affiche son nom, en gras, avec sa pochette. */ standalone?: boolean; /** Dans la liste des versions d'une fiche : lien vers la release sous les puces. */ nameLink?: boolean; star?: ReactNode; actions?: (t: any) => ReactNode; depth?: number }

/**
 * Une release : langue, qualité, source, audio, codec, équipe, commentaires, âge, taille, complétés, seeders, leechers. Toutes les
 * lignes (titres de groupe, saisons, épisodes, releases) partagent les mêmes colonnes ; la ligne entière ouvre la fiche du torrent.
 */
export function VersionRow({ t, current, standalone, nameLink, star, actions, depth = 0 }: RowProps) {
  const navigate = useNavigate();
  const group = releaseGroup(t.name);
  return (
    <div
      className={`vr-row clickable${current ? ' current' : ''}${standalone ? ' standalone' : ''}${depth ? ` d${depth}` : ''}`}
      onClick={(e) => { if (!(e.target as HTMLElement).closest('a,button,input,label')) navigate(`/torrents/${t.id}`); }}
      role="link" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' && e.target === e.currentTarget) navigate(`/torrents/${t.id}`); }}
      title="Ouvrir la fiche du torrent"
    >
      <span className="vr-lead">
        {standalone
          ? (t.coverImage ? <img className="vg-cover" src={t.coverImage} alt="" loading="lazy" /> : <span className="vg-cover none">{catIcon(t)}</span>)
          : star}
      </span>
      <div className="vr-main">
        {standalone && (
          <div className="vr-name-line">
            <Link to={`/torrents/${t.id}`} className="vr-name" title={t.name}>{t.name}</Link>
            <CopyButton text={t.name} title="Copier le nom de la release" />
          </div>
        )}
        <div className="vr-chips">
          {standalone && t.category && <CategoryTag category={t.category} />}
          <MetaChips t={t} inline />{/* date, langue, épisode, année, résolution, source, codec vidéo, format, codec audio (en dernier) */}
          {!standalone && group && <Link to={`/team/${teamSlug(group)}`} className="vr-group" title={`Team ${group}`}>{group}</Link>}
          {t.freeleech && <span className="badge freeleech">FL</span>}
          {t.status === 'DEAD' && <span className="vr-dead" title="Plus aucun seeder">☠️</span>}
          <span className="vr-uploader">{t.uploader && !t.anonymousUpload ? <UserLink user={t.uploader} /> : <span className="muted">Anonyme</span>}</span>
          {standalone && star}
          {!standalone && <CopyButton text={t.name} title="Copier le nom de la release" />}
        </div>
        {nameLink && !standalone && !current && <Link to={`/torrents/${t.id}`} className="vr-sub-name" title={t.name}>{t.name}</Link>}
      </div>
      <span className="vr-num vr-cm" title="Commentaires">{comments(t)}</span>
      <span className="vr-num vr-age">{timeAgo(t.createdAt)}</span>
      <span className="vr-num vr-size">{formatBytes(t.size)}</span>
      <span className="vr-num" title="Téléchargements complétés">{t.completedCount ?? 0}</span>
      <span className="vr-num vr-seed" title="Seeders">{t.seeders ?? 0}</span>
      <span className="vr-num vr-leech" title="Leechers">{t.leechers ?? 0}</span>
      <span className="vr-actions">
        {actions?.(t)}
        <button type="button" className="icon-btn icon-btn-sq" title="Télécharger le .torrent" aria-label="Télécharger le .torrent" onClick={() => downloadTorrent(t.id, t.name)}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12" /><path d="M7 10l5 5 5-5" /><path d="M5 21h14" /></svg>
        </button>
      </span>
    </div>
  );
}

export const sortVersions = (rows: any[]) => [...rows].sort((a, b) =>
  digits(a.season) - digits(b.season) || digits(a.episode) - digits(b.episode)
  || RES_RANK(b.resolution) - RES_RANK(a.resolution) || Number(b.size) - Number(a.size));

/** Ligne de regroupement (saison, épisode) : mêmes colonnes que les autres, avec les minimums / maximums de ses releases. */
function Node({ depth, label, tags, rows, open, onToggle, children }: { depth: number; label: ReactNode; tags?: ReactNode; rows: any[]; open: boolean; onToggle: () => void; children?: ReactNode }) {
  return (
    <>
      <div className={`vg-sub d${depth}${open ? ' open' : ''}`} onClick={onToggle} role="button" tabIndex={0} aria-expanded={open}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); } }}>
        <span />
        <div className="vr-main"><div className="vg-sub-line"><strong>{label}</strong>{tags}</div></div>
        <Aggregate rows={rows} />
        <span className="vg-toggle" aria-hidden="true">{open ? '⌃' : '⌄'}</span>
      </div>
      {open && children}
    </>
  );
}

function SeriesBody({ rows, mode, star, actions }: { rows: any[]; mode: 'packs' | 'episodes'; star?: (t: any) => ReactNode; actions?: (t: any) => ReactNode }) {
  const subset = rows.filter((r) => (mode === 'packs') === isPack(r));
  const seasons = new Map<number, any[]>();
  subset.forEach((r) => { const k = digits(r.season); seasons.set(k, [...(seasons.get(k) ?? []), r]); });
  const nums = [...seasons.keys()].sort((a, b) => a - b);
  // Tout est déplié à l'ouverture d'une série : toutes ses saisons, tous ses épisodes ; chaque niveau se replie d'un clic.
  const [openSeasons, setOpenSeasons] = useState<Set<string>>(() => new Set(nums.map((n) => `${mode}:${n}`)));
  const [openEps, setOpenEps] = useState<Set<string>>(() => {
    const keys = new Set<string>();
    for (const n of nums) {
      const perEp = new Map<number, number>();
      seasons.get(n)!.forEach((r) => { const k = digits(r.episode); perEp.set(k, (perEp.get(k) ?? 0) + 1); });
      for (const [e, count] of perEp) if (count > 1) keys.add(`${mode}:${n}:${e}`);
    }
    return keys;
  });
  const flip = (set: Set<string>, setter: (s: Set<string>) => void, key: string) => { const n = new Set(set); if (n.has(key)) n.delete(key); else n.add(key); setter(n); };

  return (
    <div className="vg-rows">
      {nums.map((n) => {
        const sRows = seasons.get(n)!;
        const sKey = `${mode}:${n}`;
        const label = n === 0 ? (mode === 'packs' ? 'Intégrale' : 'Épisodes') : `Saison ${n}`;
        if (mode === 'packs') {
          return (
            <Node key={sKey} depth={1} label={label} rows={sRows} open={openSeasons.has(sKey)} onToggle={() => flip(openSeasons, setOpenSeasons, sKey)}
              tags={<span className="vg-tags">{resCounts(sRows).map(([res, c]) => <span key={res} className="vg-res">{res} <span className="muted">({c})</span></span>)}</span>}>
              {sortVersions(sRows).map((t) => <VersionRow key={t.id} t={t} depth={2} star={star?.(t)} actions={actions} />)}
            </Node>
          );
        }
        const eps = new Map<number, any[]>();
        sRows.forEach((r) => { const k = digits(r.episode); eps.set(k, [...(eps.get(k) ?? []), r]); });
        const epNums = [...eps.keys()].sort((a, b) => a - b);
        return (
          <Node key={sKey} depth={1} label={label} rows={sRows} open={openSeasons.has(sKey)} onToggle={() => flip(openSeasons, setOpenSeasons, sKey)}
            tags={<span className="vg-tags muted">{epNums.length} épisode{epNums.length > 1 ? 's' : ''}</span>}>
            {epNums.map((e) => {
              const eRows = eps.get(e)!;
              const eKey = `${sKey}:${e}`;
              // Un épisode avec une seule release : la release s'affiche directement (son code S17E03 est dans ses pastilles), sans niveau de plus à déplier.
              if (eRows.length === 1) return <VersionRow key={eRows[0].id} t={eRows[0]} depth={2} star={star?.(eRows[0])} actions={actions} />;
              return (
                <Node key={eKey} depth={2} label={`E${String(e).padStart(2, '0')}`} rows={eRows} open={openEps.has(eKey)} onToggle={() => flip(openEps, setOpenEps, eKey)}
                  tags={<span className="vg-tags">{resCounts(eRows).map(([res, c]) => <span key={res} className="vg-res">{res} <span className="muted">({c})</span></span>)}</span>}>
                  {sortVersions(eRows).map((t) => <VersionRow key={t.id} t={t} depth={3} star={star?.(t)} actions={actions} />)}
                </Node>
              );
            })}
          </Node>
        );
      })}
    </div>
  );
}

function Group({ rows, actions, star }: { rows: any[]; actions?: (t: any) => ReactNode; star?: (t: any) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const sorted = sortVersions(rows);
  const first = sorted[0];
  const cover = sorted.find((r) => r.coverImage)?.coverImage;
  // Titre du film / de la série (fiche TMDB) : jamais le nom d'une release ; sans fiche, le nom nettoyé de la release.
  const title = rows.find((r) => r.displayTitle)?.displayTitle ?? releaseTitle(first.name);
  const runtime = rows.find((r) => r.runtime)?.runtime as number | undefined;
  const isSeries = rows.some((r) => r.season) || rows.some((r) => r.metaKind === 'tv');
  const packs = isSeries ? rows.filter(isPack) : [];
  const eps = isSeries ? rows.filter((r) => !isPack(r)) : [];
  const [mode, setMode] = useState<'packs' | 'episodes'>(packs.length ? 'packs' : 'episodes');
  // Team la plus présente parmi les releases (avec lien vers sa page).
  const counts = new Map<string, { name: string; n: number }>();
  rows.forEach((r) => { const g = releaseGroup(r.name); if (g) { const k = teamSlug(g); counts.set(k, { name: g, n: (counts.get(k)?.n ?? 0) + 1 }); } });
  const topTeam = [...counts.entries()].sort((a, b) => b[1].n - a[1].n)[0];

  const pick = (m: 'packs' | 'episodes') => { setMode(m); setOpen(true); };

  return (
    <div className={`vg${open ? ' open' : ''}`}>
      <div className="vg-head" onClick={(e) => { if (!(e.target as HTMLElement).closest('a,button')) setOpen((v) => !v); }} role="button" tabIndex={0} aria-expanded={open}
        onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); setOpen((v) => !v); } }}>
        <span className="vr-lead">{cover ? <img className="vg-cover" src={cover} alt="" loading="lazy" /> : <span className="vg-cover none">{catIcon(first)}</span>}</span>
        <div className="vr-main">
          <div className="vg-name">
            {title}{first.year && <span className="muted"> ({first.year})</span>}
            {topTeam && <Link to={`/team/${topTeam[0]}`} className="vr-group big" title={`Team ${topTeam[1].name}`}>{topTeam[1].name}</Link>}
          </div>
          <div className="vg-tags">
            {first.category && <CategoryTag category={first.category} />}
            {runtime ? <span className="vg-runtime" title={isSeries ? 'Durée d\'un épisode' : 'Durée'}>⏱ {isSeries ? `~${formatMinutes(runtime)} / épisode` : formatMinutes(runtime)}</span> : null}
            {isSeries ? (
              <>
                {packs.length > 0 && <button type="button" className={`vg-mode${open && mode === 'packs' ? ' on' : ''}`} onClick={() => pick('packs')}>Saisons complètes ({packs.length}) ⌄</button>}
                {eps.length > 0 && <button type="button" className={`vg-mode${open && mode === 'episodes' ? ' on' : ''}`} onClick={() => pick('episodes')}>À l'épisode ({eps.length}) ⌄</button>}
              </>
            ) : (
              <>
                {resCounts(rows).map(([res, n]) => <span key={res} className="vg-res">{res} <span className="muted">({n})</span></span>)}
                {rows.length > 1 && <span className="muted">{rows.length} versions</span>}
              </>
            )}
          </div>
        </div>
        <Aggregate rows={rows} />
        <span className="vg-toggle" aria-hidden="true">{open ? '⌃' : '⌄'}</span>
      </div>
      {open && (isSeries
        ? <SeriesBody key={mode} rows={rows} mode={mode} star={star} actions={actions} />
        : <div className="vg-rows">{sorted.map((t) => <VersionRow key={t.id} t={t} depth={1} star={star?.(t)} actions={actions} />)}</div>)}
    </div>
  );
}

/**
 * Affichage « Groupé » : un film, une série, un album... reconnu (fiche TMDB, Deezer...) apparaît sous son seul titre, même
 * avec une seule release ; un clic sur la ligne déplie les releases, qui gardent leur nom d'origine et ouvrent la fiche au clic.
 * Une série se range par « saisons complètes » et « à l'épisode » (saison → épisode → releases). Une release sans fiche
 * reste une ligne simple avec son nom (en gras, alignée comme les titres).
 */
export default function TorrentGroups({ items, star, actions }: { items: any[]; star?: (t: any) => ReactNode; actions?: (t: any) => ReactNode }) {
  const order: string[] = [];
  const map = new Map<string, any[]>();
  for (const t of items) {
    const k = groupKey(t);
    if (!map.has(k)) { map.set(k, []); order.push(k); }
    map.get(k)!.push(t);
  }
  return (
    <div className="vg-list">
      <div className="vg-legend">
        <span /><span>Titre / version</span><span className="vr-num" title="Commentaires">💬</span><span className="vr-num">Âge</span><span className="vr-num">Taille</span><span className="vr-num">Compl.</span><span className="vr-num">Seed</span><span className="vr-num">Leech</span><span />
      </div>
      {order.map((k) => {
        const rows = map.get(k)!;
        if (rows.length === 1 && !rows[0].displayTitle) {
          const t = rows[0];
          return <div key={k} className="vg single"><VersionRow t={t} standalone star={star?.(t)} actions={actions} /></div>;
        }
        return <Group key={k} rows={rows} actions={actions} star={star} />;
      })}
    </div>
  );
}
