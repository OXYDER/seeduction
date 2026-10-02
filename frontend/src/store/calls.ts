import { create } from 'zustand';
import type { Socket } from 'socket.io-client';
import { api } from '../api/client';
import { useMessenger } from './messenger';
import { endBeep, startRing, stopRing } from '../lib/callSounds';

export type CallPhase = 'idle' | 'outgoing' | 'incoming' | 'connecting' | 'active';
export interface CallPeer { id: string; username: string; avatarUrl?: string | null }

interface CallsState {
  phase: CallPhase;
  callId: string | null;
  conversationId: string | null;
  peer: CallPeer | null;
  /** L'appel a été lancé comme un appel vidéo. */
  video: boolean;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  micOn: boolean;
  camOn: boolean;
  sharing: boolean;
  peerMic: boolean;
  peerVideo: boolean;
  startedAt: number | null;
  minimized: boolean;
  /** Message bref à afficher après un appel (refusé, terminé, erreur de micro...). */
  notice: string | null;
  start: (conversationId: string, peer: CallPeer, video: boolean) => Promise<void>;
  accept: (withVideo: boolean) => Promise<void>;
  decline: () => void;
  hangup: () => void;
  toggleMic: () => void;
  toggleCam: () => Promise<void>;
  toggleShare: () => Promise<void>;
  setMinimized: (v: boolean) => void;
  clearNotice: () => void;
  bind: (socket: Socket) => () => void;
}

const FALLBACK_ICE: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];

// État WebRTC : il ne vit pas dans le store (objets non sérialisables, et l'interface n'a pas besoin de les suivre).
let pc: RTCPeerConnection | null = null;
let local: MediaStream | null = null;
let polite = false;
let makingOffer = false;
let ignoreOffer = false;
let canNegotiate = false;
let queue: Promise<unknown> = Promise.resolve();
let incoming: { callId: string; conversationId: string; video: boolean; from: CallPeer } | null = null;
let abortedBeforeInvite = false;
let failTimer: ReturnType<typeof setTimeout> | null = null;
let noticeTimer: ReturnType<typeof setTimeout> | null = null;
let iceRestarted = false;
let screenTrack: MediaStreamTrack | null = null;

const socketOf = () => useMessenger.getState().socket;

async function fetchIce(): Promise<RTCIceServer[]> {
  try {
    const { data } = await api.get('/messenger/calls/ice');
    return data.iceServers?.length ? data.iceServers : FALLBACK_ICE;
  } catch { return FALLBACK_ICE; }
}

function mediaError(err: any): string {
  const name = err?.name as string | undefined;
  if (!navigator.mediaDevices?.getUserMedia) return 'Les appels ont besoin d\'une connexion sécurisée (https) et d\'un navigateur récent.';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Autorise le micro (et la caméra) dans ton navigateur pour appeler.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'Aucun micro détecté sur cet appareil.';
  if (name === 'NotReadableError') return 'Le micro est utilisé par une autre application.';
  return 'Impossible d\'accéder au micro.';
}

/** Micro (obligatoire) + caméra (si demandée) ; sans caméra disponible, on continue en audio seulement. */
async function getMedia(video: boolean): Promise<{ ok: true; stream: MediaStream; camFailed: boolean } | { ok: false; error: string }> {
  const audio: MediaTrackConstraints = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('unsupported');
    if (video) {
      try {
        return { ok: true, stream: await navigator.mediaDevices.getUserMedia({ audio, video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' } }), camFailed: false };
      } catch (err: any) {
        if (err?.name === 'NotAllowedError') throw err;
        return { ok: true, stream: await navigator.mediaDevices.getUserMedia({ audio }), camFailed: true };
      }
    }
    return { ok: true, stream: await navigator.mediaDevices.getUserMedia({ audio }), camFailed: false };
  } catch (err: any) {
    return { ok: false, error: mediaError(err) };
  }
}

export const useCalls = create<CallsState>((set, get) => {
  const send = (event: string, payload: any) => socketOf()?.emit(event, payload);
  const signal = (data: any) => { const id = get().callId; if (id) send('call:signal', { callId: id, data }); };
  const sendMedia = () => {
    const id = get().callId;
    const s = get();
    if (id) send('call:media', { callId: id, data: { mic: s.micOn, video: s.camOn || s.sharing } });
  };

  function showNotice(text: string | null) {
    if (noticeTimer) clearTimeout(noticeTimer);
    set({ notice: text });
    if (text) noticeTimer = setTimeout(() => set({ notice: null }), 6000);
  }

  /** Remet tout à zéro : micro/caméra relâchés, connexion fermée, sonnerie coupée. */
  function teardown(notice?: string | null, beep = false) {
    stopRing();
    if (beep) endBeep();
    if (failTimer) { clearTimeout(failTimer); failTimer = null; }
    local?.getTracks().forEach((t) => t.stop());
    screenTrack?.stop();
    screenTrack = null;
    local = null;
    if (pc) {
      pc.onicecandidate = pc.ontrack = pc.onnegotiationneeded = pc.onconnectionstatechange = null;
      try { pc.close(); } catch { /* déjà fermée */ }
      pc = null;
    }
    makingOffer = ignoreOffer = canNegotiate = iceRestarted = false;
    incoming = null;
    queue = Promise.resolve();
    set({
      phase: 'idle', callId: null, conversationId: null, peer: null, video: false, localStream: null, remoteStream: null,
      micOn: true, camOn: false, sharing: false, peerMic: true, peerVideo: false, startedAt: null, minimized: false,
    });
    if (notice !== undefined) showNotice(notice);
  }

  function createPeer(iceServers: RTCIceServer[]) {
    const conn = new RTCPeerConnection({ iceServers });
    pc = conn;
    conn.onicecandidate = (e) => { if (e.candidate) signal({ candidate: e.candidate.toJSON() }); };
    conn.ontrack = (e) => {
      const stream = e.streams[0] ?? get().remoteStream ?? new MediaStream();
      if (!e.streams[0]) stream.addTrack(e.track);
      set({ remoteStream: stream });
    };
    conn.onnegotiationneeded = async () => {
      if (!canNegotiate || pc !== conn) return;
      try {
        makingOffer = true;
        await conn.setLocalDescription();
        signal({ description: conn.localDescription });
      } catch (err) { console.warn('Négociation WebRTC impossible', err); }
      finally { makingOffer = false; }
    };
    conn.onconnectionstatechange = () => {
      if (pc !== conn) return;
      const st = conn.connectionState;
      if (failTimer) { clearTimeout(failTimer); failTimer = null; }
      if (st === 'connected') {
        stopRing();
        if (get().phase !== 'active') set({ phase: 'active', startedAt: Date.now() });
        sendMedia();
      } else if (st === 'disconnected' || st === 'failed') {
        // Coupure réseau : on tente de relancer la connexion une fois, puis on abandonne.
        if (!iceRestarted) { iceRestarted = true; try { conn.restartIce(); } catch { /* navigateur ancien */ } }
        failTimer = setTimeout(() => {
          if (pc === conn && conn.connectionState !== 'connected') {
            const id = get().callId;
            if (id) send('call:hangup', { callId: id });
            teardown('La connexion a été perdue (réseau).', true);
          }
        }, st === 'failed' ? 6000 : 12000);
      }
    };
    return conn;
  }

  function attachLocal(conn: RTCPeerConnection, stream: MediaStream) {
    local = stream;
    stream.getTracks().forEach((t) => conn.addTrack(t, stream));
  }

  /** Remplace ce que la caméra / le partage envoie (ou arrête l'envoi avec `null`). */
  async function setVideoTrack(track: MediaStreamTrack | null) {
    if (!local) return;
    local.getVideoTracks().forEach((t) => local!.removeTrack(t));
    if (track) local.addTrack(track);
    set({ localStream: local });
    if (!pc) return;
    const tr = pc.getTransceivers().find((t) => t.receiver.track.kind === 'video' && (t.currentDirection as string) !== 'stopped');
    if (tr) {
      await tr.sender.replaceTrack(track);
      if (track && (tr.direction === 'recvonly' || tr.direction === 'inactive')) tr.direction = 'sendrecv';
    } else if (track) {
      pc.addTrack(track, local);
    }
  }

  async function handleSignal(data: any) {
    const conn = pc;
    if (!conn) return;
    try {
      if (data?.description) {
        const d = data.description as RTCSessionDescriptionInit;
        const collision = d.type === 'offer' && (makingOffer || conn.signalingState !== 'stable');
        ignoreOffer = !polite && collision;
        if (ignoreOffer) return;
        await conn.setRemoteDescription(d);
        canNegotiate = true;
        if (d.type === 'offer') {
          await conn.setLocalDescription();
          signal({ description: conn.localDescription });
        }
      } else if (data?.candidate) {
        try { await conn.addIceCandidate(data.candidate); } catch (err) { if (!ignoreOffer) throw err; }
      }
    } catch (err) {
      console.warn('Signal WebRTC ignoré', err);
    }
  }

  return {
    phase: 'idle', callId: null, conversationId: null, peer: null, video: false, localStream: null, remoteStream: null,
    micOn: true, camOn: false, sharing: false, peerMic: true, peerVideo: false, startedAt: null, minimized: false, notice: null,

    async start(conversationId, peer, video) {
      if (get().phase !== 'idle') return;
      const socket = socketOf();
      if (!socket?.connected) { showNotice('Le Messenger se reconnecte, réessaie dans un instant.'); return; }
      abortedBeforeInvite = false;
      showNotice(null);
      set({ phase: 'outgoing', conversationId, peer, video, micOn: true, camOn: false, sharing: false, peerMic: true, peerVideo: false, minimized: false });
      const [media, ice] = await Promise.all([getMedia(video), fetchIce()]);
      if (abortedBeforeInvite || get().phase !== 'outgoing') { if ('stream' in media) media.stream.getTracks().forEach((t) => t.stop()); return; }
      if ('error' in media) { teardown(media.error); return; }
      local = media.stream;
      createPeer(ice);
      set({ localStream: media.stream, camOn: media.stream.getVideoTracks().length > 0 });
      if (video && media.camFailed) showNotice("Caméra indisponible : l'appel se fait en audio seulement.");
      socket.timeout(10000).emit('call:invite', { conversationId, video: video && !media.camFailed }, (err: any, res: any) => {
        if (err || !res?.ok) {
          if (get().phase === 'outgoing') teardown(res?.error ?? 'Pas de réponse du serveur.');
          return;
        }
        if (abortedBeforeInvite || get().phase !== 'outgoing') { send('call:hangup', { callId: res.callId }); return; }
        set({ callId: res.callId });
        startRing('out');
      });
    },

    async accept(withVideo) {
      const inc = incoming;
      if (!inc || get().phase !== 'incoming') return;
      stopRing();
      set({ phase: 'connecting' });
      const [media, ice] = await Promise.all([getMedia(withVideo && inc.video), fetchIce()]);
      if (get().phase !== 'connecting' || get().callId !== inc.callId) { if ('stream' in media) media.stream.getTracks().forEach((t) => t.stop()); return; }
      if ('error' in media) { send('call:decline', { callId: inc.callId }); teardown(media.error); return; }
      polite = true;
      const conn = createPeer(ice);
      attachLocal(conn, media.stream);
      set({ localStream: media.stream, camOn: media.stream.getVideoTracks().length > 0 });
      socketOf()?.timeout(10000).emit('call:accept', { callId: inc.callId }, (err: any, res: any) => {
        if (err || !res?.ok) teardown(res?.error ?? "Impossible de rejoindre l'appel.");
      });
    },

    decline() {
      const id = get().callId;
      if (id) send('call:decline', { callId: id });
      teardown(undefined);
    },

    hangup() {
      const s = get();
      if (s.phase === 'idle') return;
      if (s.callId) send('call:hangup', { callId: s.callId });
      else abortedBeforeInvite = true;
      const dur = s.startedAt ? Math.round((Date.now() - s.startedAt) / 1000) : 0;
      teardown(dur ? `Appel terminé · ${Math.floor(dur / 60)}:${String(dur % 60).padStart(2, '0')}` : null, true);
    },

    toggleMic() {
      const track = local?.getAudioTracks()[0];
      if (!track) return;
      track.enabled = !track.enabled;
      set({ micOn: track.enabled });
      sendMedia();
    },

    async toggleCam() {
      const s = get();
      if (!local || s.phase === 'idle') return;
      if (s.camOn) {
        if (!s.sharing) { local.getVideoTracks().forEach((t) => t.stop()); await setVideoTrack(null); }
        set({ camOn: false });
      } else {
        try {
          const cam = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' } });
          if (get().sharing) { cam.getTracks().forEach((t) => t.stop()); set({ camOn: true }); }
          else { await setVideoTrack(cam.getVideoTracks()[0]); set({ camOn: true }); }
        } catch (err: any) {
          showNotice(err?.name === 'NotAllowedError' ? 'Autorise la caméra dans ton navigateur.' : 'Aucune caméra disponible.');
          return;
        }
      }
      sendMedia();
    },

    async toggleShare() {
      const s = get();
      if (!local || s.phase === 'idle') return;
      if (s.sharing) {
        screenTrack?.stop();
        screenTrack = null;
        set({ sharing: false });
        if (get().camOn) {
          try {
            const cam = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' } });
            await setVideoTrack(cam.getVideoTracks()[0]);
          } catch { set({ camOn: false }); await setVideoTrack(null); }
        } else await setVideoTrack(null);
      } else {
        try {
          const display = await (navigator.mediaDevices as any).getDisplayMedia({ video: true });
          const track: MediaStreamTrack = display.getVideoTracks()[0];
          local.getVideoTracks().forEach((t) => t.stop());
          screenTrack = track;
          track.onended = () => { if (get().sharing && screenTrack === track) void get().toggleShare(); };
          await setVideoTrack(track);
          set({ sharing: true });
        } catch { return; }
      }
      sendMedia();
    },

    setMinimized: (v) => set({ minimized: v }),
    clearNotice: () => showNotice(null),

    bind(socket) {
      const onIncoming = (p: { callId: string; conversationId: string; video: boolean; from: CallPeer }) => {
        if (get().phase !== 'idle') { socket.emit('call:decline', { callId: p.callId }); return; }
        incoming = p;
        set({ phase: 'incoming', callId: p.callId, conversationId: p.conversationId, peer: p.from, video: p.video, micOn: true, camOn: false, sharing: false, peerMic: true, peerVideo: p.video, minimized: false });
        showNotice(null);
        startRing('in');
        const { settings } = useMessenger.getState();
        if (document.hidden && settings.desktop && 'Notification' in window && Notification.permission === 'granted') {
          try {
            const n = new Notification(`${p.from.username} t'appelle`, { body: p.video ? 'Appel vidéo' : 'Appel audio', tag: `call-${p.callId}`, requireInteraction: true });
            n.onclick = () => { window.focus(); n.close(); };
          } catch { /* notifications indisponibles */ }
        }
      };
      const onAccepted = async ({ callId }: { callId: string }) => {
        if (get().callId !== callId || !pc || !local) return;
        stopRing();
        polite = false;
        canNegotiate = true;
        set({ phase: 'connecting' });
        attachLocal(pc, local);
      };
      const onSignal = ({ callId, data }: { callId: string; data: any }) => {
        if (get().callId !== callId) return;
        queue = queue.then(() => handleSignal(data));
      };
      const onMedia = ({ callId, data }: { callId: string; data: { mic: boolean; video: boolean } }) => {
        if (get().callId !== callId) return;
        set({ peerMic: !!data?.mic, peerVideo: !!data?.video });
      };
      const onEnded = ({ callId, reason }: { callId: string; reason: string }) => {
        const s = get();
        if (s.callId !== callId) return;
        const who = s.peer?.username ?? 'Ton interlocuteur';
        const dur = s.startedAt ? Math.round((Date.now() - s.startedAt) / 1000) : 0;
        let text: string | null = null;
        if (reason === 'declined') text = `${who} a refusé l'appel.`;
        else if (reason === 'missed') text = s.phase === 'incoming' ? `Appel manqué de ${who}.` : `${who} n'a pas répondu.`;
        else if (reason === 'cancelled') text = `Appel manqué de ${who}.`;
        else if (reason === 'dropped') text = "L'appel a été interrompu.";
        else if (reason === 'ended') text = dur ? `Appel terminé · ${Math.floor(dur / 60)}:${String(dur % 60).padStart(2, '0')}` : null;
        teardown(text, true);
      };
      const onHandled = ({ callId }: { callId: string }) => {
        if (get().phase === 'incoming' && get().callId === callId) teardown('Appel pris sur un autre appareil.');
      };
      const onDisconnect = () => { if (get().phase !== 'idle') teardown('La connexion au Messenger a été perdue : appel terminé.', true); };

      socket.on('call:incoming', onIncoming);
      socket.on('call:accepted', onAccepted);
      socket.on('call:signal', onSignal);
      socket.on('call:media', onMedia);
      socket.on('call:ended', onEnded);
      socket.on('call:handled', onHandled);
      socket.on('disconnect', onDisconnect);
      return () => {
        socket.off('call:incoming', onIncoming);
        socket.off('call:accepted', onAccepted);
        socket.off('call:signal', onSignal);
        socket.off('call:media', onMedia);
        socket.off('call:ended', onEnded);
        socket.off('call:handled', onHandled);
        socket.off('disconnect', onDisconnect);
      };
    },
  };
});
