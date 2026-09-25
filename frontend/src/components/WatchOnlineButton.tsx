import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuthStore } from '../store/auth';
import { api } from '../api/client';
import { playableFiles, streamUrl } from '../lib/streaming';
import { formatBytes } from '../lib/format';

type Mode = 'browser' | 'desktop';

/**
 * Deux façons de regarder sans télécharger de client torrent manuellement :
 * - « Visualiser en ligne » (navigateur) : le NAS relaie le fichier, mais seuls les formats lisibles nativement
 *   par un <video> (.mp4/.webm...) sont proposés — voir STREAMING.md.
 * - « Ouvrir dans le lecteur Seeduction » (desktop-player/) : un petit logiciel installé sur le PC du membre
 *   télécharge directement depuis les seeders (aucune charge sur le NAS) et lance VLC — aucune limite de format.
 */
export default function WatchOnlineButton({ torrentId, fileList }: { torrentId: string; fileList: { path: string; size: number }[] | null | undefined }) {
  const passkey = useAuthStore((s) => s.user?.passkey);
  const browserFiles = playableFiles(fileList);
  const allFiles = (fileList ?? []).map((f, index) => ({ ...f, index }));
  const [mode, setMode] = useState<Mode | null>(null);
  const [chosen, setChosen] = useState<number | null>(null);
  const [installHint, setInstallHint] = useState(false);
  const [sessionError, setSessionError] = useState('');

  if (allFiles.length === 0) return null;

  function start(m: Mode) {
    setMode(m);
    setSessionError('');
    setInstallHint(false);
    const files = m === 'browser' ? browserFiles : allFiles;
    setChosen(files.length === 1 ? files[0].index : null);
  }

  async function playInBrowser(index: number) {
    setChosen(index);
  }

  async function playOnDesktop(index: number) {
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
    setMode(null);
    setChosen(null);
  }

  return (
    <>
      {browserFiles.length > 0 && (
        <button type="button" onClick={() => start('browser')} title="Regarder directement dans le navigateur, sans télécharger de client">
          ▶ Visualiser en ligne
        </button>
      )}
      <button type="button" className="secondary" onClick={() => start('desktop')} title="Ouvre le lecteur Seeduction installé sur ton PC : tous les formats, aucune charge sur le NAS">
        🖥️ Ouvrir dans le lecteur Seeduction
      </button>

      {mode && createPortal(
        <div className="trailer-modal" onClick={close}>
          <button type="button" className="secondary trailer-close" onClick={close}>✕ Fermer</button>
          <div className="trailer-modal-inner" onClick={(e) => e.stopPropagation()} style={mode === 'desktop' ? { aspectRatio: 'auto', width: 'min(480px, 100%)', padding: 24 } : undefined}>
            {mode === 'browser' && (
              chosen == null ? (
                <FilePicker files={browserFiles} onPick={playInBrowser} />
              ) : passkey ? (
                <video key={chosen} controls autoPlay src={streamUrl(torrentId, chosen, passkey)} style={{ width: '100%', height: '100%', background: '#000' }} />
              ) : null
            )}
            {mode === 'desktop' && (
              <div className="panel" style={{ background: 'var(--bg-panel)', margin: 0 }}>
                {chosen == null ? (
                  <FilePicker files={allFiles} onPick={playOnDesktop} />
                ) : (
                  <>
                    <h3 style={{ marginTop: 0 }}>🖥️ Ouverture du lecteur Seeduction…</h3>
                    {sessionError ? (
                      <p style={{ color: 'var(--danger)' }}>{sessionError}</p>
                    ) : (
                      <p className="muted">Le lecteur devrait s'ouvrir et démarrer la lecture dans VLC dans quelques secondes.</p>
                    )}
                    {installHint && (
                      <div className="panel ornate" style={{ marginTop: 12 }}>
                        <strong>Rien ne se passe ?</strong>
                        <p className="muted" style={{ margin: '6px 0 10px' }}>
                          Le lecteur Seeduction n'est peut-être pas encore installé sur ce PC.
                        </p>
                        <a href="https://github.com/OXYDER/seeduction/tree/main/desktop-player" target="_blank" rel="noreferrer" className="secondary" style={{ display: 'inline-block' }}>
                          Comment installer le lecteur
                        </a>
                      </div>
                    )}
                    <button type="button" className="secondary" style={{ marginTop: 12 }} onClick={() => setChosen(null)}>← Choisir un autre fichier</button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

function FilePicker({ files, onPick }: { files: { index: number; path: string; size: number }[]; onPick: (index: number) => void }) {
  return (
    <div className="panel" style={{ maxWidth: 420, background: 'var(--bg-panel)', margin: 0 }}>
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
