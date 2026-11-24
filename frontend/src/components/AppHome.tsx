import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { KIND_ICON, clock, useDevices, useTicking, useVodStatus, type Device, type VodPromo } from '../lib/vodLive';

/** Une commande vers un appareil (pause, avance...) : l'application l'exécute à son prochain message, en moins de 4 secondes en lecture. */
export async function sendCommand(id: string, body: Record<string, unknown>): Promise<string | null> {
  try { await api.post(`/vod/devices/${id}/command`, body); return null; } catch (e: any) { return e?.response?.data?.message ?? 'Commande refusée.'; }
}

/** Mosaïque d'affiches réelles du catalogue (décor des bandeaux promo). */
export function Wall({ covers }: { covers: string[] }) {
  if (!covers.length) return null;
  return <div className="apppromo-wall" aria-hidden>{covers.slice(0, 24).map((c) => <img key={c} src={c} alt="" loading="lazy" decoding="async" />)}</div>;
}

/** Bandeau pour ceux qui n'ont pas encore l'application : ce qu'ils obtiennent, chiffres réels, et deux boutons (découvrir, soutenir). */
export function AppPromoBanner({ promo }: { promo: VodPromo | null }) {
  const titles = promo ? promo.movies + promo.series : 0;
  return (
    <section className="apppromo" aria-label="Seeduction TV">
      <Wall covers={promo?.covers ?? []} />
      <div className="apppromo-in">
        <div className="sc-kicker">Nouveau · Seeduction TV (SDTV)</div>
        <h3>Ton cinéma privé, sur ton téléphone et ta télé.</h3>
        <p>Des films et des séries à portée de pouce, lecture instantanée, <strong>sans ratio à gérer</strong>. Réservé aux donateurs, aux fondateurs et aux uploaders.</p>
        {promo && titles > 0 && (
          <div className="apppromo-chips">
            <span>{titles.toLocaleString('fr-CA')} titres prêts à lire</span>
            {promo.fresh > 0 && <span>+{promo.fresh} cette semaine</span>}
            <span>0 pub · 0 abonnement tiers</span>
          </div>
        )}
        <div className="apppromo-cta">
          <Link to="/soutenir" className="download-btn" style={{ textDecoration: 'none' }}>❤️ Débloquer avec un don</Link>
          <Link to="/application" className="secondary" style={{ padding: '10px 16px', border: '1px solid var(--border-gold)', borderRadius: 4, color: '#fff' }}>Découvrir l'application</Link>
        </div>
      </div>
    </section>
  );
}

function NowCard({ d, reload }: { d: Device; reload: () => void }) {
  const p = d.playing!;
  const pos = useTicking(p);
  const [msg, setMsg] = useState('');
  const act = async (body: Record<string, unknown>) => { const m = await sendCommand(d.id, body); setMsg(m ?? ''); if (!m) setTimeout(reload, 1500); };
  const pct = p.duration > 0 ? Math.min(100, (pos / p.duration) * 100) : 0;
  return (
    <div className="appnow-card">
      {p.cover ? <img src={p.cover} alt="" loading="lazy" /> : <div className="ph">🎬</div>}
      <div style={{ minWidth: 0, display: 'grid', gap: 2 }}>
        <span className="appnow-dev"><span className="live-dot" />{KIND_ICON[d.kind] ?? '📱'} {d.name}</span>
        <div className="appnow-title">{p.title}</div>
        {p.subtitle && <div className="appnow-sub">{p.subtitle}</div>}
        <div className="appnow-bar"><i style={{ width: `${pct}%` }} /></div>
        <div className="appnow-sub" style={{ display: 'flex', justifyContent: 'space-between' }}><span>{p.paused ? '⏸ En pause' : '▶ En lecture'}</span><span>{clock(pos)}{p.duration ? ` / ${clock(p.duration)}` : ''}</span></div>
        <div className="appnow-ctrl">
          <button type="button" className="secondary" title="Reculer de 10 s" onClick={() => act({ type: 'seekBy', value: -10 })}>⏪</button>
          <button type="button" className="secondary" title={p.paused ? 'Reprendre' : 'Pause'} onClick={() => act({ type: p.paused ? 'play' : 'pause' })}>{p.paused ? '▶' : '⏸'}</button>
          <button type="button" className="secondary" title="Avancer de 10 s" onClick={() => act({ type: 'seekBy', value: 10 })}>⏩</button>
          <button type="button" className="secondary" title="Arrêter" onClick={() => act({ type: 'stop' })}>⏹</button>
          {msg && <span className="appnow-sub" style={{ color: 'var(--danger)' }}>{msg}</span>}
        </div>
      </div>
    </div>
  );
}

/** Section de l'accueil : ce qui joue en ce moment dans l'application et sur quel appareil (les infos de base ; le contrôle complet est sur la page « Mes appareils »). */
export default function AppHome() {
  const st = useVodStatus();
  const eligible = !!st?.eligible;
  const { items, reload } = useDevices(eligible, 5000);
  if (!st) return null;
  if (!eligible) return <AppPromoBanner promo={st.promo} />;
  const online = (items ?? []).filter((d) => d.online);
  const playing = online.filter((d) => d.playing);
  return (
    <section className="appnow" aria-label="Seeduction TV : en lecture">
      <div className="appnow-head">
        <h3><span className={`live-dot${playing.length ? '' : ' off'}`} /> Seeduction TV</h3>
        <span className="muted" style={{ fontSize: 13 }}>
          {items === null ? '…' : playing.length ? `${playing.length} lecture${playing.length > 1 ? 's' : ''} en cours` : online.length ? `${online.length} appareil${online.length > 1 ? 's' : ''} connecté${online.length > 1 ? 's' : ''}, rien en lecture` : items.length ? 'Aucun appareil connecté pour le moment' : "Pas encore d'appareil"}
        </span>
        <span className="spacer" />
        <Link to="/appareils" className="secondary" style={{ fontSize: 13, padding: '5px 12px', border: '1px solid var(--border)', borderRadius: 4 }}>🎛️ Contrôle et statistiques</Link>
      </div>
      <div className="appnow-body">
        {playing.map((d) => <NowCard key={d.id} d={d} reload={reload} />)}
        {playing.length === 0 && (
          <div className="ctl-idle" style={{ gridColumn: '1 / -1' }}>
            {items && items.length > 0
              ? <>Ouvre l'application sur un de tes appareils ({items.slice(0, 3).map((d) => `${KIND_ICON[d.kind] ?? '📱'} ${d.name}`).join(', ')}) : ce qui joue apparaît ici en direct, et tu peux le piloter depuis le site. Ou <Link to="/appareils">lance un titre à distance</Link>.</>
              : <>Installe Seeduction TV sur ton téléphone ou ta télé : ce que tu regardes s'affichera ici, en direct. <Link to="/application">Comment l'installer →</Link></>}
          </div>
        )}
      </div>
    </section>
  );
}

/** Sur la page Soutenir : ce que le don ouvre côté application. */
export function AppPerk() {
  const st = useVodStatus();
  const promo = st?.promo ?? null;
  const titles = promo ? promo.movies + promo.series : 0;
  return (
    <section className="perk-app">
      <div className="sc-kicker">Inclus avec ton don</div>
      <h3>🎬 Seeduction TV : ton cinéma privé</h3>
      <ul>
        <li>{titles > 0 ? `${titles.toLocaleString('fr-CA')} films et séries` : 'Tous les films et séries'} à lancer en un clic, sur téléphone, tablette, télé et box Android</li>
        <li><strong>Zéro ratio</strong> : ce que tu regardes n'est jamais compté</li>
        <li>Lecteur de cinéma, casting, bandes-annonces, notes des membres, reprise sur tous tes appareils</li>
        <li>Télécommande sur le site : vois et pilote ce qui joue chez toi</li>
      </ul>
      <div><Link to="/application" className="secondary" style={{ display: 'inline-block', padding: '8px 16px', border: '1px solid var(--border-gold)', borderRadius: 4 }}>Découvrir l'application →</Link></div>
    </section>
  );
}
