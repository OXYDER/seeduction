import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { api } from '../api/client';
import { formatNumber } from '../lib/format';
import { durationFr } from '../lib/duration';
import { PotGauge } from '../pages/Pot';

const NAMES = ['Le Pot du Plaisir', 'La Cagnotte', 'Le Gros Lot', 'La Marmite', 'Le Chaudron', 'Le Coffre aux Seeds', 'La Tirelire', 'Le Pot de la Communauté', "Le Pot d'Or"];
const MAX_HOURS = 720;

/** Admin > Pot commun : réglages du pot (objectif, récompenses et leurs durées, départ, remerciements), état du pot en cours, lancement et mise de la maison. */
export default function PotAdmin() {
  const [cfg, setCfg] = useState<any>(null);
  const [state, setState] = useState<any>(null);
  const [topUp, setTopUp] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(() => api.get('/pot/config').then((r) => { setCfg(r.data.config); setState(r.data.state); }).catch((e) => setError(e.response?.data?.message ?? 'Chargement impossible')), []);
  useEffect(() => { void load(); }, [load]);

  const set = (key: string, value: any) => setCfg((c: any) => ({ ...c, [key]: value }));
  const ok = (m: string) => { setError(''); setMessage(m); };
  const fail = (e: any) => { setMessage(''); setError(e.response?.data?.message ?? 'Erreur'); };

  async function save() {
    setBusy(true);
    try { const r = await api.put('/pot/config', cfg); setCfg(r.data.config); setState(r.data.state); ok('✓ Réglages enregistrés'); } catch (e) { fail(e); } finally { setBusy(false); }
  }
  async function trigger() {
    if (!window.confirm('Lancer la récompense maintenant ?')) return;
    setBusy(true);
    try { await api.post('/pot/trigger'); ok('✓ Récompense lancée'); await load(); } catch (e) { fail(e); } finally { setBusy(false); }
  }
  async function addHouse() {
    setBusy(true);
    try { await api.post('/pot/topup', { amount: Number(topUp) }); setTopUp(''); ok('✓ Points ajoutés au pot'); await load(); } catch (e) { fail(e); } finally { setBusy(false); }
  }

  if (!cfg) return <p className="muted">{error || 'Chargement…'}</p>;

  const num = (key: string, label: string, hint?: string, suffix?: string) => (
    <Field label={label} hint={hint}>
      <div className="row" style={{ gap: 6, alignItems: 'center' }}>
        <input type="number" min={0} value={cfg[key]} onChange={(e) => set(key, e.target.value === '' ? 0 : Number(e.target.value))} style={{ width: 140 }} />
        {suffix && <span className="muted">{suffix}</span>}
      </div>
    </Field>
  );
  const dur = (key: string, label: string, hint?: string, max = MAX_HOURS) => (
    <Field label={label} hint={hint}><DurationInput hours={cfg[key]} max={max} onChange={(h) => set(key, h)} /></Field>
  );
  const check = (key: string, label: string, hint?: string) => (
    <label className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
      <input type="checkbox" checked={!!cfg[key]} onChange={(e) => set(key, e.target.checked)} style={{ marginTop: 3, width: 'auto' }} />
      <span><strong>{label}</strong>{hint && <span className="muted" style={{ display: 'block', fontSize: 12 }}>{hint}</span>}</span>
    </label>
  );

  const cycle = state?.enabled ? state.cycle : null;
  const summary = [
    cfg.freeleechEnabled ? `freeleech global ${durationFr(cfg.rewardHours)}` : null,
    cfg.doubleUpload ? `double upload ${durationFr(cfg.doubleUploadHours > 0 ? cfg.doubleUploadHours : cfg.rewardHours)}` : null,
    cfg.fastFillHours > 0 && cfg.fastFillBonusHours > 0 ? `+${durationFr(cfg.fastFillBonusHours)} si rempli en moins de ${durationFr(cfg.fastFillHours)}` : null,
    cfg.rainPoints > 0 ? `pluie de ${formatNumber(cfg.rainPoints)} points` : null,
    cfg.rewardTokens > 0 ? `${cfg.rewardTokens} jeton(s) par donateur` : null,
  ].filter(Boolean).join(' · ');

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="panel">
        <h3 style={{ marginTop: 0 }}>🍯 Pot commun</h3>
        <p className="muted" style={{ margin: 0 }}>
          Les membres versent des points bonus dans un pot commun. Quand l'objectif est atteint, tout le monde profite des récompenses que tu choisis ici, chacune avec sa propre durée. Les réglages s'appliquent tout de suite.
        </p>
        {error && <div style={{ color: 'var(--danger)', marginTop: 8 }}>{error}</div>}
        {message && <div style={{ color: 'var(--success)', marginTop: 8 }}>{message}</div>}
      </div>

      {cycle && (
        <div className="panel ornate">
          <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <strong>Pot n° {cycle.number} — {cycle.status === 'OPEN' ? 'ouvert' : 'PLEIN, en attente de lancement'}</strong>
            <span className="muted">Il manque {formatNumber(cycle.remaining)} points</span>
          </div>
          <PotGauge percent={cycle.percent} collected={cycle.collected} goal={cycle.goal} full={cycle.status !== 'OPEN'} />
          <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginTop: 10, alignItems: 'center' }}>
            {cycle.status === 'FULL' && <button type="button" disabled={busy} onClick={trigger}>🎉 Lancer la récompense</button>}
            {cycle.status === 'OPEN' && (
              <>
                <input type="number" min={1} value={topUp} onChange={(e) => setTopUp(e.target.value)} placeholder="Mise de la maison (points)" style={{ width: 210 }} />
                <button type="button" className="secondary" disabled={busy || !topUp} onClick={addHouse} title="Ajoute des points au pot sans en débiter à personne">🏠 Ajouter au pot</button>
              </>
            )}
            <a href="/pot" className="muted" style={{ marginLeft: 'auto' }}>Voir la page des membres →</a>
          </div>
        </div>
      )}

      <div className="panel grid" style={{ gap: 14 }}>
        <strong>Général</strong>
        {check('enabled', 'Pot ouvert', 'Décoché : le pot disparaît pour les membres (les points déjà versés restent dans le pot).')}
        <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
          <Field label="Nom du pot" hint="Affiché partout (page, accueil, bandeau freeleech).">
            <input list="pot-names" value={cfg.name} maxLength={40} onChange={(e) => set('name', e.target.value)} style={{ width: 260 }} />
            <datalist id="pot-names">{NAMES.map((n) => <option key={n} value={n} />)}</datalist>
          </Field>
          <Field label="Icône"><input value={cfg.icon} maxLength={8} onChange={(e) => set('icon', e.target.value)} style={{ width: 80 }} /></Field>
        </div>
      </div>

      <div className="panel grid" style={{ gap: 14 }}>
        <strong>Objectif et dons</strong>
        <div className="row" style={{ gap: 18, flexWrap: 'wrap' }}>
          {num('goal', 'Montant nécessaire', "Points bonus pour remplir le pot. Changer ce montant s'applique aussi au pot en cours.", 'points')}
          {num('minDonation', 'Don minimum', undefined, 'points')}
          {num('maxDonation', 'Don maximum à la fois', '0 = aucune limite', 'points')}
          {num('dailyLimit', 'Limite par membre sur 24 h', "0 = aucune limite (évite qu'un seul membre remplisse tout)", 'points')}
          {num('minAccountDays', 'Ancienneté minimale du compte', '0 = aucune (évite les comptes créés pour donner et profiter)', 'jours')}
        </div>
        <div className="row" style={{ gap: 18, flexWrap: 'wrap' }}>
          {num('goalPerMember', 'Objectif selon les membres actifs', 'Si > 0, les pots suivants valent ce montant × le nombre de membres vus ces 30 jours (jamais moins que le montant nécessaire). Remplace l\'augmentation en %.', 'points / membre')}
          {num('goalGrowthPct', 'Le prochain pot est plus gros de', 'Rend chaque remplissage un peu plus difficile que le précédent (0 = même objectif).', '%')}
        </div>
        {check('carryOver', "Reporter l'excédent", "Si le dernier don dépasse l'objectif, le surplus reste dans le pot suivant. Décoché : le dernier don est limité à ce qui manque.")}
      </div>

      <div className="panel grid" style={{ gap: 14 }}>
        <strong>Récompenses quand le pot est plein <span className="muted" style={{ fontWeight: 400 }}>— chacune a sa durée</span></strong>
        {summary && <div className="muted" style={{ fontSize: 12 }}>Résumé : {summary}</div>}
        {check('freeleechEnabled', 'Freeleech global', 'Les téléchargements de tout le monde ne comptent pas dans le ratio.')}
        {cfg.freeleechEnabled && dur('rewardHours', 'Durée du freeleech global', "Jusqu'à 30 jours. Si un freeleech est déjà en cours, celui du pot démarre juste après.")}
        {check('doubleUpload', 'Double upload global', "L'upload de tout le monde compte en double.")}
        {cfg.doubleUpload && dur('doubleUploadHours', 'Durée du double upload', '0 = la même durée que le freeleech.')}
        <div className="row" style={{ gap: 18, flexWrap: 'wrap' }}>
          {dur('fastFillHours', 'Remplissage rapide : si le pot est plein en moins de', '0 = désactivé. Récompense les communautés qui se mobilisent vite.')}
          {cfg.fastFillHours > 0 && dur('fastFillBonusHours', 'alors les récompenses durent en plus', 'Ajouté à la durée du freeleech et du double upload.')}
        </div>
        <div className="row" style={{ gap: 18, flexWrap: 'wrap' }}>
          {num('rewardTokens', 'Jetons freeleech par donateur', 'Offerts à chaque donateur du pot (0 à 50).', 'jetons')}
          {num('rainPoints', 'Pluie de points', 'Points offerts à chaque membre actif (vu ces 7 jours) quand le pot est plein.', 'points')}
        </div>
      </div>

      <div className="panel grid" style={{ gap: 14 }}>
        <strong>Départ de la récompense</strong>
        {check('autoStart', 'Démarrer automatiquement', 'Décoché : le pot plein attend que tu cliques « Lancer la récompense » (utile pour choisir le bon moment).')}
        <div className="row" style={{ gap: 18, flexWrap: 'wrap' }}>
          {dur('startDelayHours', 'Délai avant le départ', 'Le temps de prévenir tout le monde (0 = tout de suite, maximum 72 h).', 72)}
          <Field label="Heure de départ fixe" hint="Heure de Montréal. La récompense attend la prochaine occurrence de cette heure (ex. 18 h pour une soirée).">
            <select value={cfg.startAtHour} onChange={(e) => set('startAtHour', Number(e.target.value))} style={{ width: 200 }}>
              <option value={-1}>Dès que possible</option>
              {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')} h</option>)}
            </select>
          </Field>
          {dur('cooldownHours', 'Délai entre deux récompenses', 'Temps minimum entre la fin d\'une récompense du pot et le début de la suivante (0 = aucun).')}
        </div>
      </div>

      <div className="panel grid" style={{ gap: 14 }}>
        <strong>Remerciements aux donateurs</strong>
        <div className="row" style={{ gap: 18, flexWrap: 'wrap' }}>
          {num('donorRefundPct', 'Points rendus aux donateurs', 'Pourcentage de ses dons rendu à chaque donateur au remplissage (0 = rien, les dons sont définitifs).', '%')}
          {num('topDonorBonus', 'Bonus au meilleur donateur', 'Points offerts au n° 1 du pot ; le n° 2 reçoit 60 % et le n° 3 30 %.', 'points')}
        </div>
      </div>

      <div className="panel grid" style={{ gap: 14 }}>
        <strong>Communication</strong>
        {check('announce', 'Annonce et notification à tous quand le pot est plein', 'Publie une nouvelle (type « Événement ») et envoie une notification à chaque membre.')}
        {check('milestones', 'Prévenir tout le monde à 50 % et à 90 %', 'Donne envie de finir le pot — mais envoie deux notifications à chaque membre par pot.')}
        <Field label="Message du bandeau freeleech (BBCode, facultatif)" hint="Affiché sous « En savoir plus » pendant la récompense. Vide = message automatique.">
          <textarea rows={3} value={cfg.message} maxLength={2000} onChange={(e) => set('message', e.target.value)} style={{ width: '100%' }} />
        </Field>
      </div>

      <div><button type="button" disabled={busy} onClick={save}>{busy ? 'Enregistrement…' : 'Enregistrer les réglages'}</button></div>
    </div>
  );
}

/** Durée saisie en heures ou en jours (stockée en heures). */
function DurationInput({ hours, max, onChange }: { hours: number; max: number; onChange: (hours: number) => void }) {
  const [unit, setUnit] = useState<'h' | 'j'>(hours >= 24 && hours % 24 === 0 ? 'j' : 'h');
  const factor = unit === 'j' ? 24 : 1;
  const shown = hours === 0 ? 0 : unit === 'j' ? Math.round(hours / 24) : hours;
  const apply = (n: number, f: number) => onChange(Math.max(0, Math.min(max, Math.round(n * f))));
  return (
    <div className="row" style={{ gap: 6, alignItems: 'center' }}>
      <input type="number" min={0} value={shown} onChange={(e) => apply(e.target.value === '' ? 0 : Number(e.target.value), factor)} style={{ width: 100 }} />
      <select value={unit} onChange={(e) => { const u = e.target.value as 'h' | 'j'; setUnit(u); apply(shown, u === 'j' ? 24 : 1); }} style={{ width: 90 }}>
        <option value="h">heures</option>
        <option value="j">jours</option>
      </select>
      {hours > 0 && <span className="muted" style={{ fontSize: 12 }}>= {durationFr(hours)}</span>}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label style={{ display: 'grid', gap: 3 }}>
      <span style={{ fontSize: 13 }}>{label}</span>
      {children}
      {hint && <span className="muted" style={{ fontSize: 11, maxWidth: 340 }}>{hint}</span>}
    </label>
  );
}
