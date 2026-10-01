import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { formatBytes, formatClock } from '../lib/format';

/**
 * « Ouvrir dans le lecteur Seeduction » (desktop-player/) : un petit logiciel installé sur le PC du membre
 * télécharge directement depuis les seeders (aucune charge sur le serveur) et lance Seeduction VLC — aucune limite de
 * format. Affiché uniquement pour du contenu vidéo (voir isVideoKind côté TorrentDetail) ; l'ancien lecteur intégré
 * au navigateur (limité au .mp4/.webm) a été retiré au profit de celui-ci, plus capable.
 */
export default function WatchOnlineButton({ torrentId, fileList, compact }: { torrentId: string; fileList: { path: string; size: number }[] | null | undefined; compact?: boolean }) {
  const allFiles = (fileList ?? []).map((f, index) => ({ ...f, index }));
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<number | null>(null);
  const [installHint, setInstallHint] = useState(false);
  const [sessionError, setSessionError] = useState('');
  const [resume, setResume] = useState<{ positionSeconds: number; playingNow: boolean; resumable: boolean } | null>(null);

  // Position laissée par une lecture précédente dans le lecteur Seeduction (voir StreamService.pingWatching) :
  // au-delà de 2 minutes et pas déjà terminé, on propose de reprendre plutôt que de rouvrir depuis le début ;
  // et si le ping est tout frais (quelques secondes), une lecture est en cours à l'instant même. Interrogé
  // périodiquement pour suivre l'état en quasi temps réel pendant que la fiche reste ouverte. Seulement pour le
  // bouton complet (fiche torrent) : la variante compacte (liste de Parcourir) n'affiche que « ▶ » et ne vaut pas
  // la rafale d'une requête par ligne affichée.
  useEffect(() => {
    if (compact) return;
    let cancelled = false;
    const load = () => api.get(`/stream/position/${torrentId}`).then((r) => { if (!cancelled) setResume(r.data); }).catch(() => {});
    load();
    const interval = window.setInterval(load, 5000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [torrentId, compact]);

  if (allFiles.length === 0) return null;

  function start() {
    setOpen(true);
    setSessionError('');
    setInstallHint(false);
    if (allFiles.length === 1) play(allFiles[0].index); else setChosen(null);
  }

  async function play(index: number) {
    setChosen(index);
    try {
      const { data } = await api.post('/stream/session', { torrentId, fileIndex: index });
      window.location.href = `seeduction://stream/${data.token}`;
      // Aucune API fiable ne dit si un gestionnaire de protocole est installé : si la page n'a pas perdu le focus
      // (le lecteur ne s'est pas ouvert par-dessus) après un court délai, on suppose qu'il ne l'est pas.
      window.setTimeout(() => { if (!document.hidden) setInstallHint(true); }, 1500);
    } catch (err: any) {
      setSessionError(err.response?.data?.message ?? "Impossible de préparer la lecture");
    }
  }

  function close() {
    setOpen(false);
    setChosen(null);
  }

  return (
    <>
      <button
        type="button"
        onClick={start}
        className={compact ? 'icon-btn icon-btn-sq' : undefined}
        title={
          resume?.playingNow ? 'En cours de lecture dans le lecteur Seeduction'
            : resume?.resumable ? `Reprend à ${formatClock(resume.positionSeconds)} dans le lecteur Seeduction`
            : 'Ouvre le lecteur Seeduction installé sur ton PC : tous les formats, aucune charge sur le serveur'
        }
      >
        {compact ? '▶' : resume?.playingNow ? '▶️ En cours de lecture' : resume?.resumable ? `🖥️ Reprendre la lecture à ${formatClock(resume.positionSeconds)}` : '🖥️ Ouvrir dans le lecteur Seeduction'}
      </button>

      {open && createPortal(
        <div className="trailer-modal" onClick={close}>
          <button type="button" className="secondary trailer-close" onClick={close}>✕ Fermer</button>
          <div className="trailer-modal-inner" onClick={(e) => e.stopPropagation()} style={{ aspectRatio: 'auto', width: 'min(480px, 100%)', padding: 24 }}>
            <div className="panel" style={{ background: 'var(--bg-panel)', margin: 0 }}>
              {chosen == null ? (
                <FilePicker files={allFiles} onPick={play} />
              ) : (
                <>
                  <h3 style={{ marginTop: 0 }}>🖥️ Ouverture du lecteur Seeduction…</h3>
                  {sessionError ? (
                    <p style={{ color: 'var(--danger)' }}>{sessionError}</p>
                  ) : (
                    <p className="muted">Le lecteur devrait s'ouvrir et démarrer la lecture dans quelques secondes.</p>
                  )}
                  {installHint && (
                    <div className="panel ornate" style={{ marginTop: 12 }}>
                      <strong>Rien ne se passe ?</strong>
                      <p className="muted" style={{ margin: '6px 0 10px' }}>
                        Le lecteur Seeduction n'est peut-être pas encore installé sur ce PC.
                      </p>
                      <Link to="/player" className="secondary" style={{ display: 'inline-block' }} onClick={close}>
                        Comment installer le lecteur
                      </Link>
                    </div>
                  )}
                  {allFiles.length > 1 && (
                    <button type="button" className="secondary" style={{ marginTop: 12 }} onClick={() => setChosen(null)}>← Choisir un autre fichier</button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

function FilePicker({ files, onPick }: { files: { index: number; path: string; size: number }[]; onPick: (index: number) => void }) {
  return (
    <div>
      <h3 style={{ marginTop: 0 }}>Quel fichier regarder ?</h3>
      <div className="grid" style={{ gap: 8 }}>
        {files.map((f) => (
          <button key={f.index} type="button" className="secondary" style={{ textAlign: 'left' }} onClick={() => onPick(f.index)}>
            {f.path} <span className="muted">({formatBytes(f.size)})</span>
          </button>
        ))}
      </div>
    </div>
  );
}
