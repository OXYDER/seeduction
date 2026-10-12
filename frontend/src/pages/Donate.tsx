import { useEffect, useState } from 'react';
import { api } from '../api/client';
import Avatar from '../components/Avatar';
import UserLink from '../components/UserLink';
import { useDonors } from '../store/donors';

interface Tier { minAmount: number; label: string; days: number; freeleechDays: number; hnrDays: number; bonusPoints: number; invites: number }
interface Info {
  enabled: boolean; currency: string; headline: string; text: string; howTo: string; links: { label: string; url: string }[]; tiers: Tier[];
  goal: { monthly: number; received: number; percent: number | null };
  wall: { id: string; username: string; avatarUrl: string | null; active: boolean }[];
  me: { donor: boolean; active: boolean; since: string | null; until: string | null; total: number; invites: number; freeleechUntil: string | null; hnrExemptUntil: string | null; wall: boolean };
}
const date = (d: string | null) => (d ? new Date(d).toLocaleDateString('fr-CA', { day: 'numeric', month: 'long', year: 'numeric' }) : '');
const money = (n: number, cur: string) => `${n.toLocaleString('fr-CA', { maximumFractionDigits: 2 })} ${cur}`;

function perks(t: Tier): string[] {
  return [
    t.days ? `❤️ Statut donateur ${t.days} jours` : '',
    t.freeleechDays ? `🆓 Freeleech personnel ${t.freeleechDays} jours (tes téléchargements ne comptent pas dans ton ratio)` : '',
    t.hnrDays ? `🛡️ Hit & run désactivé ${t.hnrDays} jours` : '',
    t.bonusPoints ? `✦ ${t.bonusPoints.toLocaleString('fr-CA')} points bonus` : '',
    t.invites ? `✉️ ${t.invites} invitation${t.invites > 1 ? 's' : ''} de plus` : '',
  ].filter(Boolean);
}

/** Page « Soutenir » : pourquoi donner, comment, objectif du mois, avantages par palier, mur des donateurs et situation du membre. Les dons se font sur une plateforme externe. */
export default function Donate() {
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState('');
  const loadDonors = useDonors((s) => s.load);
  const load = () => api.get('/donations/info').then((r) => setInfo(r.data)).catch(() => setError('Chargement impossible'));
  useEffect(() => { load(); }, []);

  async function toggleWall(show: boolean) {
    await api.put('/donations/me/wall', { show }).catch(() => undefined);
    load(); loadDonors();
  }

  if (error) return <div className="panel"><p style={{ color: 'var(--danger)' }}>{error}</p></div>;
  if (!info) return <p className="muted">Chargement…</p>;
  if (!info.enabled) return <div className="panel"><p className="muted">Les dons ne sont pas ouverts pour le moment. Merci de ton soutien !</p></div>;

  return (
    <div className="grid" style={{ gap: 14 }}>
      <div>
        <h1 style={{ margin: 0 }}>❤️ {info.headline}</h1>
        <p className="muted" style={{ margin: '6px 0 0', whiteSpace: 'pre-wrap' }}>{info.text}</p>
      </div>

      {info.goal.monthly > 0 && (
        <div className="panel">
          <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
            <strong>Objectif du mois</strong>
            <span>{money(info.goal.received, info.currency)} / {money(info.goal.monthly, info.currency)}{info.goal.percent !== null ? ` · ${info.goal.percent} %` : ''}</span>
          </div>
          <div className="don-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={info.goal.percent ?? 0}><i style={{ width: `${info.goal.percent ?? 0}%` }} /></div>
          <p className="muted" style={{ margin: '6px 0 0', fontSize: 12.5 }}>
            {info.goal.percent !== null && info.goal.percent >= 100 ? 'Objectif atteint ce mois-ci, merci à toutes et à tous ! Les dons suivants préparent les mois à venir.' : 'Le serveur, le stockage et la bande passante sont couverts grâce à vos dons.'}
          </p>
        </div>
      )}

      {info.me.donor && (
        <div className="panel" style={{ borderColor: info.me.active ? '#fb7185' : undefined }}>
          <h3 style={{ marginTop: 0 }}>{info.me.active ? '❤️ Tu es donateur, merci !' : '🤍 Merci d\'avoir soutenu Seeduction'}</h3>
          <div className="muted" style={{ fontSize: 13.5, lineHeight: 1.7 }}>
            Donateur depuis le {date(info.me.since)} · total donné : <strong>{money(info.me.total, info.currency)}</strong><br />
            {info.me.active ? <>Statut actif jusqu'au <strong>{date(info.me.until)}</strong>.</> : <>Ton statut actif est terminé : le ❤️ est devenu un 🤍 (tu restes ancien donateur).</>}
            {info.me.freeleechUntil && <><br />🆓 Freeleech personnel jusqu'au {date(info.me.freeleechUntil)}</>}
            {info.me.hnrExemptUntil && <><br />🛡️ Hit & run désactivé jusqu'au {date(info.me.hnrExemptUntil)}</>}
            {info.me.invites > 0 && <><br />✉️ {info.me.invites} invitation{info.me.invites > 1 ? 's' : ''} de plus que ton rang</>}
          </div>
          <label className="row" style={{ gap: 8, alignItems: 'center', marginTop: 10 }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={info.me.wall} onChange={(e) => toggleWall(e.target.checked)} /> Afficher mon pseudo sur le mur des donateurs
          </label>
        </div>
      )}

      <div className="panel">
        <h3 style={{ marginTop: 0 }}>Comment donner</h3>
        <p className="muted" style={{ marginTop: 0, whiteSpace: 'pre-wrap' }}>{info.howTo}</p>
        {info.links.length === 0 ? <p className="muted">Les liens de don seront bientôt disponibles.</p> : (
          <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
            {info.links.map((l) => <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" className="don-link">{l.label} ↗</a>)}
          </div>
        )}
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12 }}>
        {info.tiers.map((t) => (
          <div key={t.label} className="panel don-tier">
            <strong style={{ fontSize: 17 }}>{t.label}</strong>
            <span className="don-amount">dès {money(t.minAmount, info.currency)}</span>
            <ul>{perks(t).map((p) => <li key={p}>{p}</li>)}</ul>
          </div>
        ))}
      </div>
      <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>Les avantages d'un nouveau don s'ajoutent à ceux déjà en cours. Le statut donateur (❤️ à côté de ton pseudo) ne disparaît jamais : il devient 🤍 à la fin de la période. Aucun contenu n'est bloqué pour ceux qui ne donnent pas.</p>

      {info.wall.length > 0 && (
        <div className="panel">
          <h3 style={{ marginTop: 0 }}>Mur des donateurs</h3>
          <div className="row" style={{ gap: 14, flexWrap: 'wrap' }}>
            {info.wall.map((w) => (
              <span key={w.id} className="row" style={{ gap: 6, alignItems: 'center' }}><Avatar user={w} size={24} /><UserLink user={w} /></span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
