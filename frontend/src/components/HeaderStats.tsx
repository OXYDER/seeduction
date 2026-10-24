import { Link } from 'react-router-dom';
import { formatBytes, formatNumber } from '../lib/format';
import { downloadMargin } from '../lib/margin';
import StatTip, { TipCard } from './StatTip';

export interface EconInfo { seeding: number; hnr: number; perHour: number; minRatio: number; graceGb: number; giftGb: number; hnrSeedHours: number; hnrRatio: number; hnrLimit: number; maxTorrents: number }
interface P { uploaded: string; downloaded: string; bonusPoints: number; ratio: number | null }

const fr = (n: number, d = 2) => n.toLocaleString('fr-CA', { minimumFractionDigits: d, maximumFractionDigits: d });

/** Les pastilles de statistiques du haut du site, chacune avec une infobulle qui explique le chiffre (ratio, upload, téléchargé, points, marge de téléchargement, seeds, hit & run). */
export default function HeaderStats({ profile, econ, teamExempt = false }: { profile: P; econ: EconInfo | null; teamExempt?: boolean }) {
  const up = Number(profile.uploaded), down = Number(profile.downloaded);
  const minRatio = econ?.minRatio ?? 0.5;
  const graceBytes = (econ?.graceGb ?? 5) * 1e9;
  const margin = downloadMargin(up, down, minRatio, graceBytes);
  const belowMin = profile.ratio !== null && minRatio > 0 && profile.ratio < minRatio && down > graceBytes;
  const gift = (econ?.giftGb ?? 0) * 1e9;
  const giftIncluded = gift > 0 && up >= gift;
  const ratioText = profile.ratio != null ? fr(profile.ratio) : '∞';

  // Équipe : ni ratio, ni upload, ni téléchargé, ni marge, ni hit & run (rien n'est comptabilisé) ; il reste les points bonus et les seeds.
  if (teamExempt) {
    return (
      <div className="stat-pills">
        <StatTip card={<TipCard icon="🛡️" title="Équipe" intro="Les membres de l'équipe ne sont pas comptabilisés : ni ratio, ni upload, ni téléchargé, ni obligation de seed (hit & run), et ils ne figurent pas dans les classements." rows={[]} />}>
          <span className="pill">🛡️ Équipe : transferts non comptabilisés</span>
        </StatTip>
        <StatTip card={<TipCard icon="✦" title="Points bonus" intro="Gagnés en seedant (et en jouant) : à dépenser dans la boutique." rows={[]} link={{ to: '/bonus', label: 'Boutique bonus →' }} />}>
          <Link to="/bonus" className="pill gold">✦ {formatNumber(Math.round(profile.bonusPoints))}</Link>
        </StatTip>
        {econ && <Link to="/activity" className="pill up" title="Torrents en seed">🌱 {econ.seeding}</Link>}
      </div>
    );
  }

  return (
    <div className="stat-pills">
      <StatTip card={<TipCard icon="⚖" title="Ratio" intro="Ton upload divisé par ce que tu as téléchargé : ce que tu donnes à la communauté par rapport à ce que tu prends."
        rows={[
          { label: 'Ton ratio', value: ratioText, tone: belowMin ? 'down' : 'up' },
          { label: 'Ratio minimum du site', value: fr(minRatio), sub: 'au-dessous, plus de nouveau téléchargement' },
          { label: 'État', value: belowMin ? '⚠ Sous le minimum' : '✔ En règle', tone: belowMin ? 'down' : 'up' },
        ]}
        note={<>Le minimum ne s'applique qu'après {econ?.graceGb ?? 5} Go téléchargés (période de grâce des nouveaux). Le double upload te fait monter plus vite ; les torrents freeleech ne comptent pas dans ton téléchargement.</>}
        link={{ to: '/wiki/guide-ratio-seed', label: 'Comment améliorer mon ratio →' }} />}>
        <Link to="/profile" className={`pill ratio ${belowMin ? 'down' : 'up'}`}>⚖ Ratio {ratioText}</Link>
      </StatTip>

      <StatTip card={<TipCard icon="▲" title="Upload" intro="Tout ce que tu as envoyé aux autres membres, double upload et crédit d'envoi compris."
        rows={[
          { label: 'Upload total', value: formatBytes(profile.uploaded), tone: 'up' },
          ...(giftIncluded ? [{ label: 'dont cadeau de bienvenue', value: formatBytes(gift), sub: 'offert à l\'inscription' }] : []),
        ]}
        note="Il augmente quand d'autres membres téléchargent depuis toi : garde tes torrents en seed. Les torrents que tu publies te donnent aussi un crédit d'envoi dès leur approbation."
        link={{ to: '/seeds', label: 'Voir mes seeds →' }} />}>
        <span className="pill up">▲ {formatBytes(profile.uploaded)}</span>
      </StatTip>

      <StatTip card={<TipCard icon="▼" title="Téléchargé" intro="Tout ce que tu as reçu des autres membres, tel qu'il compte dans ton ratio."
        rows={[{ label: 'Téléchargé', value: formatBytes(profile.downloaded), tone: 'down' }]}
        note="Les torrents freeleech (événement du site, jeton, cadeau de bienvenue) ne comptent pas dans ce chiffre."
        link={{ to: '/freeleech', label: 'Calendrier freeleech →' }} />}>
        <span className="pill down">▼ {formatBytes(profile.downloaded)}</span>
      </StatTip>

      <StatTip card={<TipCard icon="✦" title="Points bonus" intro="Gagnés en seedant (et en jouant) : à dépenser dans la boutique."
        rows={[
          { label: 'Tes points', value: formatNumber(Math.round(profile.bonusPoints)), tone: 'gold' },
          ...(econ ? [{ label: 'Gain en ce moment', value: `+${formatNumber(Math.round(econ.perHour))} pts/h`, sub: `${econ.seeding} torrent${econ.seeding > 1 ? 's' : ''} en seed` }] : []),
        ]}
        note={econ ? `Chaque torrent seedé rapporte des points chaque heure, plus s'il est gros ou rare (jusqu'à ${econ.maxTorrents} torrents).` : undefined}
        link={{ to: '/bonus', label: 'Boutique et règle du seed →' }} />}>
        <Link to="/bonus" className="pill gold">✦ {formatNumber(Math.round(profile.bonusPoints))}</Link>
      </StatTip>

      <StatTip width={340} card={<TipCard icon="⬇" title="Marge de téléchargement" intro="Volume que tu peux encore télécharger avant blocage."
        rows={[
          { label: giftIncluded ? 'Upload (cadeau de bienvenue inclus)' : 'Upload', value: formatBytes(up), sub: giftIncluded ? `dont ${formatBytes(gift)} de cadeau de bienvenue` : undefined },
          { label: 'Téléchargé', value: formatBytes(down) },
          { label: 'Ratio', value: ratioText },
          { label: 'Ratio minimum du site', value: fr(minRatio) },
          { label: 'Marge', value: margin === null ? '∞' : formatBytes(margin), tone: margin === null || margin > 0 ? 'up' : 'down' },
        ]}
        note={minRatio > 0
          ? <>Marge : ton upload divisé par {fr(minRatio, 1)}, moins ton téléchargement. Le téléchargement se bloque quand ton ratio passe sous {fr(minRatio)} (après les {econ?.graceGb ?? 5} premiers Go de grâce). Les torrents freeleech n'y touchent pas.</>
          : 'Aucun ratio minimum ne t\'est imposé : pas de limite de téléchargement.'}
        link={{ to: '/bonus', label: 'Gagner des points avec mes seeds →' }} />}>
        <span className={`pill ${margin === null || margin > 0 ? 'up' : 'down'}`}>⬇ {margin === null ? '∞' : formatBytes(margin)}</span>
      </StatTip>

      {econ && (
        <StatTip card={<TipCard icon="🌱" title="Torrents en seed" intro="Les torrents que tu partages en ce moment."
          rows={[{ label: 'En seed', value: econ.seeding, tone: 'up' }, { label: 'Points gagnés', value: `+${formatNumber(Math.round(econ.perHour))} pts/h` }]}
          note="Plus tu seedes, plus tu gagnes de points bonus, et plus ton ratio monte quand d'autres téléchargent depuis toi."
          link={{ to: '/activity', label: 'Mon activité →' }} />}>
          <Link to="/activity" className="pill up">🌱 {econ.seeding}</Link>
        </StatTip>
      )}

      {econ && (
        <StatTip card={<TipCard icon="⚠" title="Hit & run" intro={`Un torrent terminé doit être seedé ${econ.hnrSeedHours} h ou jusqu'à un ratio de ${econ.hnrRatio} sur ce torrent.`}
          rows={[{ label: 'Non régularisés', value: econ.hnr, tone: econ.hnr > 0 ? 'down' : 'up' }, { label: 'Limite avant blocage', value: econ.hnrLimit }]}
          note={econ.hnr > 0 ? `Reprends le seed de ces torrents pour les régulariser : à ${econ.hnrLimit}, tes nouveaux téléchargements sont bloqués.` : 'Aucun : parfait ! Garde simplement tes téléchargements en seed le temps demandé.'}
          link={{ to: '/hit-and-run', label: 'Voir le détail →' }} />}>
          <Link to="/hit-and-run" className={`pill ${econ.hnr > 0 ? 'down' : ''}`}>H&amp;R {econ.hnr}</Link>
        </StatTip>
      )}
    </div>
  );
}
