import PublicChatPanel from '../components/PublicChatPanel';
import { usePublicChatStore } from '../store/publicChat';

/** Chat public en pleine page (le même chat, avec le même historique, que la bulle accessible partout sur le site). */
export default function Chat() {
  const connected = usePublicChatStore((s) => s.connected);

  return (
    <div className="grid" style={{ gap: 14 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1>Chat en direct</h1>
        <span className="muted">{connected ? '🟢 Connecté' : '⏳ Connexion...'}</span>
      </div>
      <div className="panel ornate" style={{ padding: 0, height: '72vh', overflow: 'hidden' }}>
        <PublicChatPanel />
      </div>
    </div>
  );
}
