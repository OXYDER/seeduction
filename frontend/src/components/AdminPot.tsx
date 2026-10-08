import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { api } from '../api/client';
import { formatNumber } from '../lib/format';
import { PotGauge } from '../pages/Pot';

const NAMES = ['Le Pot du Plaisir', 'La Cagnotte', 'Le Gros Lot', 'La Marmite', 'Le Chaudron', 'Le Coffre aux Seeds', 'La Tirelire', 'Le Pot de la Communauté', 'Le Pot d\'Or'];

/** Admin > Pot commun : réglages du pot (objectif, récompenses, remerciements), état du pot en cours, lancement et mise de la maison. */
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
  const check = (key: string, label: string, hint?: string) => (
    <label className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
      <input type="checkbox" checked={!!cfg[key]} onChange={(e) => set(key, e.target.checked)} style={{ marginTop: 3, width: 'auto' }} />
      <span><strong>{label}</strong>{hint && <span className="muted" style={{ display: 'block', fontSize: 12 }}>{hint}</span>}</span>
    </label>
  );

  const cycle = state?.enabled ? state.cycle : null;
  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="panel">
        <h3 style={{ marginTop: 0 }}>🍯 Pot commun</h3>
        <p className="muted" style={{ margin: 0 }}>
          Les membres versent des points bonus dans un pot commun. Quand l'objectif est atteint, tout le monde profite d'un freeleech global (et d'autres récompenses au choix). Les réglages s'appliquent tout de suite.
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
          {num('goal', 'Montant nécessaire', 'Points bonus pour remplir le pot. Changer ce montant s\'applique aussi au pot en cours.', 'points')}
          {num('minDonation', 'Don minimum', undefined, 'points')}
          {num('maxDonation', 'Don maximum à la fois', '0 = aucune limite', 'points')}
          {num('dailyLimit', 'Limite par membre sur 24 h', '0 = aucune limite (évite qu\'un seul membre remplisse tout)', 'points')}
        </div>
        {check('carryOver', 'Reporter l\'excédent', 'Si le dernier don dépasse l\'objectif, le surplus reste dans le pot suivant. Décoché : le dernier don est limité à ce qui manque.')}
        {num('goalGrowthPct', 'Le prochain pot est plus gros de', 'Rend chaque remplissage un peu plus difficile que le précédent (0 = même objectif).', '%')}
      </div>

      <div className="panel grid" style={{ gap: 14 }}>
        <strong>Récompense quand le pot est plein</strong>
        <div className="row" style={{ gap: 18, flexWrap: 'wrap' }}>
          {num('rewardHours', 'Durée du freeleech global', 'Maximum 168 h (7 jours). Si un freeleech est déjà en cours, celui du pot démarre juste après.', 'heures')}
          {num('startDelayHours', 'Délai avant le départ', 'Le temps de prévenir tout le monde (0 = tout de suite, maximum 72 h).', 'heures')}
        </div>
        {check('doubleUpload', 'Double upload global en même temps', 'Pendant la récompense, l\'upload de tout le monde compte en double (en plus du freeleech).')}
        {check('autoStart', 'Démarrer automatiquement', 'Décoché : le pot plein attend que tu cliques « Lancer la récompense » (utile pour choisir le bon moment).')}
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

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label style={{ display: 'grid', gap: 3 }}>
      <span style={{ fontSize: 13 }}>{label}</span>
      {children}
      {hint && <span className="muted" style={{ fontSize: 11, maxWidth: 340 }}>{hint}</span>}
    </label>
  );
}
