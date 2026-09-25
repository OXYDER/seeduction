import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuthStore } from '../store/auth';
import { playableFiles, streamUrl } from '../lib/streaming';
import { formatBytes } from '../lib/format';

/**
 * « Visualiser en ligne » : le NAS rejoint le swarm comme un membre normal et relaie le fichier au navigateur au fur
 * et à mesure (aucun client à installer, aucun fichier .torrent à gérer). Limite volontaire de cette première
 * version : uniquement les fichiers déjà dans un format lisible nativement par le navigateur (.mp4, .webm...), sans
 * transcodage — un fichier .mkv/x265 n'aura pas ce bouton (voir STREAMING.md pour aller plus loin).
 */
export default function WatchOnlineButton({ torrentId, fileList }: { torrentId: string; fileList: { path: string; size: number }[] | null | undefined }) {
  const passkey = useAuthStore((s) => s.user?.passkey);
  const files = playableFiles(fileList);
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<number | null>(files.length === 1 ? files[0].index : null);

  if (!passkey || files.length === 0) return null;

  function play(index: number) {
    setChosen(index);
    setOpen(true);
  }

  return (
    <>
      <button type="button" onClick={() => (files.length === 1 ? play(files[0].index) : setOpen(true))} title="Regarder directement dans le navigateur, sans télécharger de client">
        ▶ Visualiser en ligne
      </button>
      {open && createPortal(
        <div className="trailer-modal" onClick={() => setOpen(false)}>
          <button type="button" className="secondary trailer-close" onClick={() => setOpen(false)}>✕ Fermer</button>
          <div className="trailer-modal-inner" onClick={(e) => e.stopPropagation()}>
            {chosen == null ? (
              <div className="panel" style={{ maxWidth: 420, background: 'var(--bg-panel)' }}>
                <h3 style={{ marginTop: 0 }}>Quel fichier regarder ?</h3>
                <div className="grid" style={{ gap: 8 }}>
                  {files.map((f) => (
                    <button key={f.index} type="button" className="secondary" style={{ textAlign: 'left' }} onClick={() => setChosen(f.index)}>
                      {f.path} <span className="muted">({formatBytes(f.size)})</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <video
                key={chosen}
                controls
                autoPlay
                src={streamUrl(torrentId, chosen, passkey)}
                style={{ width: '100%', height: '100%', background: '#000' }}
              />
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
