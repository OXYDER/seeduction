import { useEffect, useRef, useState } from 'react';
import { useMessenger } from '../../store/messenger';
import { useCalls } from '../../store/calls';
import Avatar from '../Avatar';

const fmtClock = (secs: number) => `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;

function useElapsed(startedAt: number | null) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!startedAt) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [startedAt]);
  return startedAt ? fmtClock(Math.max(0, Math.round((now - startedAt) / 1000))) : null;
}

function StreamVideo({ stream, muted, className }: { stream: MediaStream | null; muted?: boolean; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.srcObject !== stream) el.srcObject = stream;
    if (stream) el.play().catch(() => { /* lecture bloquée : un clic sur la fenêtre la relance */ });
  }, [stream]);
  return <video ref={ref} className={className} autoPlay playsInline muted={muted} />;
}

/**
 * Appels audio / vidéo : branche les événements d'appel sur la websocket du Messenger (montée une fois dans le Layout) et
 * affiche la carte « appel entrant », la fenêtre d'appel (réductible) et les messages de fin d'appel.
 */
export default function CallManager() {
  const socket = useMessenger((s) => s.socket);
  const c = useCalls();
  const elapsed = useElapsed(c.startedAt);

  useEffect(() => (socket ? useCalls.getState().bind(socket) : undefined), [socket]);

  // Quitter la page couperait l'appel : on demande confirmation tant qu'on est en ligne avec quelqu'un.
  useEffect(() => {
    if (c.phase === 'idle' || c.phase === 'incoming') return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [c.phase]);

  const canShare = typeof navigator !== 'undefined' && !!(navigator.mediaDevices as any)?.getDisplayMedia && !/Android|iPhone|iPad/i.test(navigator.userAgent);
  const peer = c.peer;

  const toast = c.notice ? (
    <div className="call-toast" role="status" onClick={c.clearNotice}>{c.notice}</div>
  ) : null;

  if (c.phase === 'idle' || !peer) return toast;

  if (c.phase === 'incoming') {
    return (
      <>
        {toast}
        <div className="call-incoming" role="alertdialog" aria-label={`Appel de ${peer.username}`}>
          <Avatar user={peer} size={56} />
          <div className="call-incoming-text">
            <strong>{peer.username}</strong>
            <span>{c.video ? '🎥 Appel vidéo entrant…' : '📞 Appel audio entrant…'}</span>
          </div>
          <div className="call-incoming-actions">
            <button type="button" className="call-btn danger" title="Refuser" aria-label="Refuser" onClick={c.decline}>✕</button>
            {c.video && <button type="button" className="call-btn neutral" title="Répondre sans caméra" aria-label="Répondre en audio seulement" onClick={() => c.accept(false)}>🎤</button>}
            <button type="button" className="call-btn ok" title="Répondre" aria-label="Répondre" onClick={() => c.accept(true)}>{c.video ? '🎥' : '📞'}</button>
          </div>
        </div>
      </>
    );
  }

  const status = c.phase === 'outgoing' ? (c.callId ? 'Ça sonne…' : 'Appel en cours…') : c.phase === 'connecting' ? 'Connexion…' : elapsed ?? '';
  const showPeerVideo = c.peerVideo && !!c.remoteStream && c.remoteStream.getVideoTracks().length > 0;
  const showLocal = (c.camOn || c.sharing) && !!c.localStream;

  return (
    <>
      {toast}
      <div className={`call-backdrop${c.minimized ? ' mini' : ''}`}>
        <div className={`call-panel${c.minimized ? ' mini' : ''}`} role="dialog" aria-label={`Appel avec ${peer.username}`}>
          {/* Toujours monté, même réduit : c'est lui qui joue le son (et l'image) de l'autre. */}
          <StreamVideo stream={c.remoteStream} className={`call-remote${showPeerVideo && !c.minimized ? '' : ' hidden'}`} />
          {c.minimized ? (
            <>
              <Avatar user={peer} size={36} />
              <div className="call-mini-text"><strong>{peer.username}</strong><span>{status}</span></div>
              <button type="button" className={`call-btn small${c.micOn ? '' : ' off'}`} title={c.micOn ? 'Couper le micro' : 'Réactiver le micro'} onClick={c.toggleMic}>{c.micOn ? '🎤' : '🔇'}</button>
              <button type="button" className="call-btn small neutral" title="Agrandir" onClick={() => c.setMinimized(false)}>⤢</button>
              <button type="button" className="call-btn small danger" title="Raccrocher" onClick={c.hangup}>📞</button>
            </>
          ) : (
            <>
              <div className="call-stage">
                <button type="button" className="call-min" title="Réduire pour continuer à naviguer" onClick={() => c.setMinimized(true)}>⌄</button>
                {!showPeerVideo && (
                  <div className="call-avatar-big">
                    <span className={c.phase === 'active' ? '' : 'pulse'}><Avatar user={peer} size={128} /></span>
                    <h3>{peer.username}</h3>
                    <p>{status}</p>
                  </div>
                )}
                {showPeerVideo && <div className="call-stage-label"><strong>{peer.username}</strong> <span>{status}</span></div>}
                {!c.peerMic && c.phase === 'active' && <div className="call-peer-muted">🔇 {peer.username} a coupé son micro</div>}
                {showLocal && <StreamVideo stream={c.localStream} muted className={`call-local${c.sharing ? ' screen' : ''}`} />}
              </div>
              <div className="call-controls">
                <button type="button" className={`call-btn${c.micOn ? '' : ' off'}`} title={c.micOn ? 'Couper le micro' : 'Réactiver le micro'} aria-pressed={!c.micOn} onClick={c.toggleMic}>{c.micOn ? '🎤' : '🔇'}</button>
                <button type="button" className={`call-btn${c.camOn ? ' on' : ''}`} title={c.camOn ? 'Couper la caméra' : 'Activer la caméra'} aria-pressed={c.camOn} disabled={c.phase !== 'active'} onClick={() => void c.toggleCam()}>{c.camOn ? '🎥' : '📷'}</button>
                {canShare && <button type="button" className={`call-btn${c.sharing ? ' on' : ''}`} title={c.sharing ? "Arrêter le partage d'écran" : "Partager mon écran"} disabled={c.phase !== 'active'} onClick={() => void c.toggleShare()}>🖥️</button>}
                <button type="button" className="call-btn danger" title="Raccrocher" aria-label="Raccrocher" onClick={c.hangup}>📞</button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
