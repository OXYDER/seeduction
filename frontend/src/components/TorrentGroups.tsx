import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { formatBytes } from '../lib/format';
import { timeAgo } from '../lib/time';
import { downloadTorrent } from '../lib/download';
import { CATEGORY_STYLE } from './Layout';
import CategoryTag from './CategoryTag';
import UserLink from './UserLink';
import CopyButton from './CopyButton';

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

/** Équipe de release : ce qui suit le dernier tiret du nom (« …x264-NOTAG » → NOTAG). */
export function releaseGroup(name: string): string | null {
  const m = /-([A-Za-z0-9]{2,16})(?:\.[A-Za-z0-9]{2,4})?$/.exec(name.replace(/\[[^\]]*\]\s*$/, '').trim());
  return m ? m[1] : null;
}

/** Clé de regroupement : la même fiche (TMDB, Deezer...) si elle est connue, sinon le titre nettoyé de la release. */
export function groupKey(t: any): string {
  if (t.metaSource && t.metaExternalId) return `m:${t.metaSource}:${t.metaExternalId}`;
  return `t:${releaseTitle(t.name).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')}|${t.category?.slug ?? ''}`;
}

const chip = (text: ReactNode, cls: string) => (text ? <span className={`vr-chip ${cls}`}>{text}</span> : null);
const catIcon = (t: any) => (CATEGORY_STYLE[t.category?.slug ?? ''] ?? CATEGORY_STYLE[t.category?.parent?.slug ?? ''])?.icon ?? '📦';

interface RowProps { t: any; current?: boolean; /** Release seule (sans titre de groupe au-dessus) : affiche son nom, en gras, avec sa pochette. */ standalone?: boolean; /** Dans la liste des versions d'une fiche : lien vers la release sous les puces. */ nameLink?: boolean; star?: ReactNode; actions?: (t: any) => ReactNode }

/**
 * Une release : langue, qualité, source, audio, codec, équipe, âge, taille, complétés, seeders, leechers. Toutes les lignes
 * (titres de groupe, releases dépliées, releases seules) partagent les mêmes colonnes, donc tout reste aligné.
 */
export function VersionRow({ t, current, standalone, nameLink, star, actions }: RowProps) {
  const group = releaseGroup(t.name);
  return (
    <div className={`vr-row${current ? ' current' : ''}${standalone ? ' standalone' : ''}`}>
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
          {t.season && chip(`${t.season}${t.episode ? ` ${t.episode}` : ''}`, 'ep')}
          {chip(t.language, 'lang')}
          {chip(t.resolution, 'res')}
          {chip([t.source, t.hdr ? 'HDR' : ''].filter(Boolean).join(' '), 'src')}
          {chip(t.audio, 'aud')}
          {t.codec && <span className="vr-codec">{t.codec}</span>}
          {!standalone && group && <span className="vr-group" title="Équipe de la release">{group}</span>}
          {t.freeleech && <span className="badge freeleech">FL</span>}
          {t.status === 'DEAD' && <span className="vr-dead" title="Plus aucun seeder">☠️</span>}
          <span className="vr-uploader">{t.uploader && !t.anonymousUpload ? <UserLink user={t.uploader} /> : <span className="muted">Anonyme</span>}</span>
          {standalone && star}
          {!standalone && <CopyButton text={t.name} title="Copier le nom de la release" />}
        </div>
        {nameLink && !standalone && !current && <Link to={`/torrents/${t.id}`} className="vr-sub-name" title={t.name}>{t.name}</Link>}
      </div>
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
  String(a.season ?? '').localeCompare(String(b.season ?? '')) || String(a.episode ?? '').localeCompare(String(b.episode ?? ''))
  || RES_RANK(b.resolution) - RES_RANK(a.resolution) || Number(b.size) - Number(a.size));

const range = (nums: number[]) => (nums.length === 0 ? '0' : Math.min(...nums) === Math.max(...nums) ? String(nums[0]) : `${Math.min(...nums)}-${Math.max(...nums)}`);
const sizeRange = (sizes: number[]) => (Math.min(...sizes) === Math.max(...sizes) ? formatBytes(sizes[0]) : `${formatBytes(Math.min(...sizes))}-${formatBytes(Math.max(...sizes))}`);

function Group({ rows, actions, star }: { rows: any[]; actions?: (t: any) => ReactNode; star?: (t: any) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const sorted = sortVersions(rows);
  const first = sorted[0];
  const byRes = new Map<string, number>();
  sorted.forEach((r) => r.resolution && byRes.set(r.resolution, (byRes.get(r.resolution) ?? 0) + 1));
  const newest = rows.reduce((a, b) => (new Date(a.createdAt) > new Date(b.createdAt) ? a : b));
  const cover = sorted.find((r) => r.coverImage)?.coverImage;
  // Titre du film / de la série (fiche TMDB) : jamais le nom d'une release ; sans fiche, le nom nettoyé de la release.
  const title = rows.find((r) => r.displayTitle)?.displayTitle ?? releaseTitle(first.name);

  return (
    <div className={`vg${open ? ' open' : ''}`}>
      {/* Toute la ligne du titre se clique pour déplier / replier les releases. */}
      <div className="vg-head" onClick={() => setOpen((v) => !v)} role="button" tabIndex={0} aria-expanded={open}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen((v) => !v); } }}>
        <span className="vr-lead">{cover ? <img className="vg-cover" src={cover} alt="" loading="lazy" /> : <span className="vg-cover none">{catIcon(first)}</span>}</span>
        <div className="vr-main">
          <div className="vg-name">{title}{first.year && <span className="muted"> ({first.year})</span>}</div>
          <div className="vg-tags">
            {first.category && <CategoryTag category={first.category} />}
            {[...byRes.entries()].map(([res, n]) => <span key={res} className="vg-res">{res} <span className="muted">({n})</span></span>)}
            {rows.length > 1 && <span className="muted">{rows.length} versions</span>}
          </div>
        </div>
        <span className="vr-num vr-age">{timeAgo(newest.createdAt)}</span>
        <span className="vr-num vr-size">{sizeRange(rows.map((r) => Number(r.size)))}</span>
        <span className="vr-num">{rows.reduce((n, r) => n + (r.completedCount ?? 0), 0)}</span>
        <span className="vr-num vr-seed">{range(rows.map((r) => r.seeders ?? 0))}</span>
        <span className="vr-num vr-leech">{range(rows.map((r) => r.leechers ?? 0))}</span>
        <span className="vg-toggle" aria-hidden="true">{open ? '⌃' : '⌄'}</span>
      </div>
      {open && <div className="vg-rows">{sorted.map((t) => <VersionRow key={t.id} t={t} star={star?.(t)} actions={actions} />)}</div>}
    </div>
  );
}

/**
 * Affichage « Groupé » : un film, une série, un album... reconnu (fiche TMDB, Deezer...) apparaît sous son seul titre, même
 * avec une seule release ; un clic sur la ligne déplie les releases, qui gardent leur nom d'origine. Une release sans fiche
 * reste une ligne simple avec son nom (en gras, aligné comme les titres).
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
        <span /><span>Titre / version</span><span className="vr-num">Âge</span><span className="vr-num">Taille</span><span className="vr-num">Compl.</span><span className="vr-num">Seed</span><span className="vr-num">Leech</span><span />
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
