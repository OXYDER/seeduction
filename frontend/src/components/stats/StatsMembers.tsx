import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { CLASS_LABEL } from '../../lib/memberClass';
import { formatBytes, formatNumber } from '../../lib/format';
import { Bars, Board, ChartCard, Donut, Section, Tile, gridStyle, memberRows } from './StatsBits';

const ratioText = (v: number) => (v >= 100 ? '99+' : v.toFixed(2));
const plural = (n: number, one: string, many = `${one}s`) => `${formatNumber(n)} ${n > 1 ? many : one}`;
const duration = (days: number) => (days >= 365 ? `${(days / 365).toFixed(1).replace('.', ',')} an${days >= 730 ? 's' : ''}` : days >= 30 ? `${Math.floor(days / 30)} mois` : `${Math.max(0, Math.floor(days))} j`);
const fmtDays = (d: number) => `${Math.floor(d)} j`;

/** Classements des membres : ratio, volume, hit & run, assiduité, participation, ancienneté. */
export default function StatsMembers({ classes }: { classes: { name: string; count: number }[] }) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  useEffect(() => { api.get('/stats/members').then((r) => setData(r.data)).catch(() => setError('Classements indisponibles')); }, []);
  if (error) return <p className="muted">{error}</p>;
  if (!data) return <p className="muted">Calcul des classements…</p>;
  const b = data.boards;
  const ratioSub = (x: any) => <>({formatBytes(x.extra.uploaded)} ↑ / {formatBytes(x.extra.downloaded)} ↓)</>;
  const pct = (n: number) => (data.seen.total ? Math.round((n / data.seen.total) * 100) : 0);

  return (
    <div className="grid" style={{ gap: 18 }}>
      <Section title="Fréquentation">
        <div className="grid" style={gridStyle(170)}>
          <Tile label="En ligne maintenant" value={formatNumber(data.seen.online)} />
          <Tile label="Vus ces 24 h" value={formatNumber(data.seen.day)} hint={`${pct(data.seen.day)} % des membres`} />
          <Tile label="Vus cette semaine" value={formatNumber(data.seen.week)} hint={`${pct(data.seen.week)} % des membres`} />
          <Tile label="Vus ce mois-ci" value={formatNumber(data.seen.month)} hint={`${pct(data.seen.month)} % des membres`} />
          <Tile label="Membres actifs au total" value={formatNumber(data.seen.total)} />
        </div>
      </Section>

      <Section title="Ratio" hint={`Le ratio est calculé pour les membres qui ont téléchargé au moins ${data.minDownloadedGb} Go (en dessous, il n'est pas significatif).`}>
        <div className="grid" style={gridStyle(340)}>
          <Board icon="🚀" title="Meilleurs ratios" rows={memberRows(b.ratioHigh, ratioText, ratioSub)} />
          <Board medals={false} icon="📉" title="Ratios les plus bas" hint="Les membres à encourager à seeder davantage." rows={memberRows(b.ratioLow, ratioText, ratioSub)} />
          <Board icon="✦" title="Plus de points bonus" rows={memberRows(b.bonus, (v) => `${formatNumber(Math.round(v))} pts`)} />
        </div>
      </Section>

      <Section title="Volume et partage">
        <div className="grid" style={gridStyle(340)}>
          <Board icon="⬆️" title="Plus gros uploadeurs" rows={memberRows(b.uploadVolume, formatBytes)} />
          <Board icon="⬇️" title="Plus gros téléchargeurs" rows={memberRows(b.downloadVolume, formatBytes)} />
          <Board icon="📦" title="Plus gros volume mis en ligne" hint="Taille totale des torrents qu'ils ont envoyés." rows={memberRows(b.uploadSize, formatBytes)} />
          <Board icon="🌱" title="Plus longs seeders" hint="Heures de seed cumulées sur tous leurs téléchargements." rows={memberRows(b.seedHours, (v) => `${formatNumber(Math.round(v))} h`)} />
          <Board icon="✅" title="Plus de téléchargements complétés" rows={memberRows(b.completed, (v) => plural(v, 'torrent'))} />
        </div>
      </Section>

      <Section title="Hit & run et assiduité">
        <div className="grid" style={gridStyle(340)}>
          <Board medals={false} icon="⚠️" title="Plus de hit & run en cours" hint="Torrents abandonnés trop tôt et pas encore régularisés." rows={memberRows(b.hnrOpen, (v) => formatNumber(v), undefined)} empty="Aucun hit & run en cours. 🎉" />
          <Board medals={false} icon="🧾" title="Plus de hit & run au total" hint="Y compris ceux qui ont été régularisés ou effacés." rows={memberRows(b.hnrTotal, (v) => formatNumber(v))} empty="Aucun hit & run enregistré. 🎉" />
          <Board icon="📆" title="Les plus assidus" hint="Nombre de jours différents où le membre a été actif ces 30 derniers jours." rows={memberRows(b.activeDays, (v) => `${v} / 30 jours`)} />
        </div>
      </Section>

      <Section title="Participation à la communauté">
        <div className="grid" style={gridStyle(340)}>
          <Board icon="💬" title="Plus de commentaires" hint="Commentaires sur les fiches de torrents." rows={memberRows(b.comments, (v) => plural(v, 'commentaire'))} />
          <Board icon="🗣️" title="Plus actifs au forum" rows={memberRows(b.forumPosts, (v) => plural(v, 'message'))} />
          <Board icon="📨" title="Plus bavards dans le chat" rows={memberRows(b.chat, (v) => plural(v, 'message'))} />
          <Board icon="👍" title="Plus remerciés" hint="Nombre de « Merci » reçus sur leurs torrents." rows={memberRows(b.thanks, (v) => formatNumber(v))} />
          <Board icon="👫" title="Plus d'amis" rows={memberRows(b.friends, (v) => plural(v, 'ami'))} />
        </div>
      </Section>

      <Section title="Ancienneté">
        <div className="grid" style={gridStyle(340)}>
          <Board icon="🏛️" title="Membres les plus anciens" rows={memberRows(b.oldest, duration)} />
          <Board icon="🌟" title="Derniers arrivés" rows={memberRows(b.newest, fmtDays)} />
        </div>
      </Section>

      <Section title="Répartitions">
        <div className="grid" style={gridStyle(380)}>
          <ChartCard title="Ratios des membres"><Bars data={data.ratioBuckets} label="Membres" colors /></ChartCard>
          <ChartCard title="Ancienneté des membres"><Bars data={data.ageBuckets} label="Membres" colors /></ChartCard>
          <ChartCard title="Rangs des membres"><Donut data={classes.map((c) => ({ ...c, name: CLASS_LABEL[c.name] ?? c.name }))} /></ChartCard>
          <ChartCard title="Activité par heure" hint={`Actions des membres sur le site, ces 30 derniers jours (heure de ${data.tz.split('/').pop().replace('_', ' ')}).`}>
            <Bars data={data.byHour.map((h: any) => ({ name: `${h.hour} h`, count: h.count }))} label="Actions" color="#c084fc" />
          </ChartCard>
          <ChartCard title="Activité par jour de la semaine"><Bars data={data.byWeekday} label="Actions" color="#2dd4bf" /></ChartCard>
        </div>
      </Section>
      <p className="muted">Classements mis à jour toutes les 5 minutes. <Link to="/leaderboard">Classement d'upload complet →</Link> · <Link to="/hall-of-fame">Hall of Fame →</Link></p>
    </div>
  );
}
