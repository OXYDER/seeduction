import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { PotGauge } from '../pages/Pot';
import { useCountdown } from './FreeleechCalendar';

/** Accueil : la jauge du pot commun en un coup d'œil, avec un lien pour donner. Se cache tant que le pot n'est pas ouvert. */
export default function PotWidget() {
  const [pot, setPot] = useState<any>(null);
  useEffect(() => {
    const load = () => api.get('/pot').then((r) => setPot(r.data)).catch(() => undefined);
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);
  const endsIn = useCountdown(pot?.active?.endsAt ?? null);
  if (!pot?.enabled) return null;
  const { cycle } = pot;
  return (
    <section className="panel ornate pot-widget">
      <div className="row" style={{ justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <strong>{pot.icon} {pot.name}</strong>
        <Link to="/pot" className="rail-all">{cycle.status === 'OPEN' ? 'Donner →' : 'Voir →'}</Link>
      </div>
      <PotGauge percent={cycle.percent} collected={cycle.collected} goal={cycle.goal} full={cycle.status !== 'OPEN'} />
      <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
        {pot.active
          ? <>🎉 Freeleech global en cours — encore <strong>{endsIn}</strong></>
          : cycle.status === 'OPEN'
            ? <>Quand il est plein : freeleech global {pot.reward.hours} h pour tout le monde{pot.reward.doubleUpload ? ' + double upload' : ''}.</>
            : <>Le pot est plein : la récompense démarre bientôt !</>}
      </div>
    </section>
  );
}
