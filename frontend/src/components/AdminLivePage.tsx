import { useState } from 'react';
import { api } from '../api/client';

export interface LivePageCfg {
  showPlayerWhenOff: boolean; showCountdown: boolean; countdownSeconds: boolean;
  offlineTitle: string; offlineMessage: string; endedTitle: string; endedMessage: string; endedMinutes: number; noneMessage: string;
  posterUrl: string; showCalendar: boolean; calendarView: 'month' | 'week' | 'list'; weekStartsMonday: boolean; horizonDays: number; showPast: boolean;
  showUpcomingList: boolean; upcomingCount: number; showEndTime: boolean; showDescription: boolean; showPlayerButton: boolean; startMuted: boolean;
  todayColor: string; eventColor: string; liveColor: string; banner: string;
}

type BoolKey = { [K in keyof LivePageCfg]: LivePageCfg[K] extends boolean ? K : never }[keyof LivePageCfg];

const label: React.CSSProperties = { display: 'grid', gap: 3, fontSize: 13 };
const group: React.CSSProperties = { display: 'grid', gap: 8, padding: 10, borderRadius: 8, border: '1px solid var(--border)' };

/** Admin › Direct › Page Direct : tout ce que les membres voient sur la page Direct (écran hors diffusion, calendrier, couleurs, textes). */
export default function AdminLivePage({ initial, onSaved }: { initial: LivePageCfg; onSaved: (p: LivePageCfg) => void }) {
  const [p, setP] = useState<LivePageCfg>(initial);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const set = <K extends keyof LivePageCfg>(k: K, v: LivePageCfg[K]) => setP((x) => ({ ...x, [k]: v }));

  const check = (k: BoolKey, text: string, hint?: string) => (
    <label style={{ display: 'flex', gap: 6, alignItems: 'flex-start', fontSize: 13.5 }}>
      <input type="checkbox" checked={p[k]} onChange={(e) => set(k, e.target.checked)} style={{ marginTop: 3 }} />
      <span>{text}{hint && <><br /><span className="muted" style={{ fontSize: 12 }}>{hint}</span></>}</span>
    </label>
  );
  const text = (k: 'offlineTitle' | 'endedTitle' | 'posterUrl', l: string, placeholder?: string) => (
    <label style={label}>{l}<input value={p[k]} onChange={(e) => set(k, e.target.value)} placeholder={placeholder} /></label>
  );
  const area = (k: 'offlineMessage' | 'endedMessage' | 'noneMessage' | 'banner', l: string, placeholder?: string) => (
    <label style={label}>{l}<textarea rows={2} value={p[k]} onChange={(e) => set(k, e.target.value)} placeholder={placeholder} /></label>
  );
  const num = (k: 'endedMinutes' | 'horizonDays' | 'upcomingCount', l: string, min: number, max: number) => (
    <label style={{ ...label, maxWidth: 220 }}>{l}<input type="number" min={min} max={max} value={p[k]} onChange={(e) => set(k, Number(e.target.value))} /></label>
  );
  const colorInput = (k: 'todayColor' | 'eventColor' | 'liveColor', l: string) => (
    <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
      <input type="color" value={p[k]} onChange={(e) => set(k, e.target.value)} style={{ width: 40, height: 28, padding: 0, border: 'none', background: 'none' }} /> {l}
    </label>
  );

  async function save() {
    setMsg(''); setErr('');
    try {
      const r = await api.put('/admin/live/config', { page: p });
      setP(r.data.page);
      onSaved(r.data.page);
      setMsg('✓ Page Direct enregistrée');
    } catch (e: any) { setErr(e.response?.data?.message ?? 'Erreur'); }
  }

  return (
    <div className="panel" style={{ display: 'grid', gap: 10 }}>
      <h3 style={{ margin: 0 }}>4. Page Direct (ce que voient les membres)</h3>

      <div style={group}>
        <strong style={{ fontSize: 13.5 }}>Annonce</strong>
        {area('banner', 'Message affiché en haut de la page (vide = aucun)', 'Ex. : Le match de ce soir est commenté en français.')}
      </div>

      <div style={group}>
        <strong style={{ fontSize: 13.5 }}>Lecteur</strong>
        {check('startMuted', 'Démarrer la vidéo sans le son', 'Recommandé : les navigateurs bloquent souvent la lecture automatique avec le son. Décoché, la page essaie avec le son et se rabat sur une lecture muette si le navigateur refuse.')}
        {check('showPlayerButton', 'Afficher « Ouvrir dans le lecteur Seeduction »')}
        {check('showDescription', 'Afficher la description des diffusions')}
        {check('showEndTime', 'Afficher l\'heure de fin des diffusions')}
      </div>

      <div style={group}>
        <strong style={{ fontSize: 13.5 }}>Hors diffusion</strong>
        {check('showPlayerWhenOff', 'Afficher l\'écran du lecteur même sans diffusion', 'Avec le nom, la date et l\'heure de la prochaine diffusion.')}
        {check('showCountdown', 'Afficher un compte à rebours jusqu\'à la prochaine diffusion')}
        {p.showCountdown && check('countdownSeconds', 'Compte à rebours à la seconde près')}
        {text('offlineTitle', 'Titre hors diffusion')}
        {area('offlineMessage', 'Message hors diffusion')}
        {area('noneMessage', 'Message quand aucune diffusion n\'est prévue')}
        {text('posterUrl', 'Image de fond de l\'écran (facultatif)', 'https://… ou /api/covers/…')}
        <span className="muted" style={{ fontSize: 12 }}>L'image d'un créneau (réglée dans le calendrier) remplace celle-ci pour la diffusion qui vient.</span>
      </div>

      <div style={group}>
        <strong style={{ fontSize: 13.5 }}>Après une diffusion</strong>
        {num('endedMinutes', 'Afficher « terminée » pendant (minutes, 0 = jamais)', 0, 1440)}
        {text('endedTitle', 'Titre')}
        {area('endedMessage', 'Message')}
      </div>

      <div style={group}>
        <strong style={{ fontSize: 13.5 }}>Calendrier</strong>
        {check('showCalendar', 'Afficher le calendrier')}
        <label style={{ ...label, maxWidth: 260 }}>Vue par défaut
          <select value={p.calendarView} onChange={(e) => set('calendarView', e.target.value as LivePageCfg['calendarView'])}>
            <option value="month">Mois</option><option value="week">Semaine</option><option value="list">Liste</option>
          </select>
        </label>
        {check('weekStartsMonday', 'La semaine commence le lundi', 'Sinon, le dimanche.')}
        {check('showPast', 'Montrer les diffusions passées (mois en cours et précédent)')}
        {num('horizonDays', 'Montrer les diffusions jusqu\'à (jours)', 7, 365)}
        {check('showUpcomingList', 'Afficher aussi la liste « À venir » sous le calendrier')}
        {p.showUpcomingList && num('upcomingCount', 'Nombre de diffusions dans la liste', 1, 30)}
      </div>

      <div style={group}>
        <strong style={{ fontSize: 13.5 }}>Couleurs</strong>
        <div className="row" style={{ gap: 16, flexWrap: 'wrap' }}>
          {colorInput('todayColor', 'Aujourd\'hui (et compte à rebours)')}
          {colorInput('eventColor', 'Diffusions')}
          {colorInput('liveColor', 'En direct')}
        </div>
        <span className="muted" style={{ fontSize: 12 }}>Chaque créneau peut aussi avoir sa propre couleur dans le calendrier.</span>
      </div>

      <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" onClick={save}>Enregistrer la page Direct</button>
        <a href="/canadiens-en-direct" target="_blank" rel="noreferrer" className="secondary">Voir la page</a>
        {(msg || err) && <span style={{ color: err ? 'var(--danger)' : 'var(--success)' }}>{err || msg}</span>}
      </div>
    </div>
  );
}
