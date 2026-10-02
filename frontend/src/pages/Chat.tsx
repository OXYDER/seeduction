import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMessenger } from '../store/messenger';
import ConversationList from '../components/messenger/ConversationList';
import ConversationView from '../components/messenger/ConversationView';
import ConversationInfo from '../components/messenger/ConversationInfo';
import NewChatModal from '../components/messenger/NewChatModal';

/** Messenger en pleine page : liste des conversations (privées, groupes, canaux) à gauche, discussion à droite, infos en option. */
export default function Chat() {
  const [params, setParams] = useSearchParams();
  const activeId = params.get('c');
  const loaded = useMessenger((s) => s.convLoaded);
  const conversations = useMessenger((s) => s.conversations);
  const [info, setInfo] = useState(false);
  const [creating, setCreating] = useState<false | 'direct' | 'group'>(false);

  const select = (id: string | null) => setParams(id ? { c: id } : {}, { replace: false });

  // Sur grand écran, on ouvre directement une conversation (le canal Général, sinon la plus récente) ; sur mobile on montre la liste.
  useEffect(() => {
    if (activeId || !loaded || conversations.length === 0) return;
    if (window.matchMedia('(max-width: 900px)').matches) return;
    const general = conversations.find((c) => c.slug === 'general');
    setParams({ c: (general ?? conversations[0]).id }, { replace: true });
  }, [activeId, loaded, conversations, setParams]);

  useEffect(() => { setInfo(false); }, [activeId]);

  return (
    <div className={`msgr-page${activeId ? ' has-active' : ''}${info ? ' with-info' : ''}`}>
      <ConversationList activeId={activeId} onSelect={select} onNew={() => setCreating('direct')} />
      <main className="msgr-main">
        {activeId ? (
          <ConversationView
            key={activeId}
            conversationId={activeId}
            variant="page"
            onBack={() => select(null)}
            onOpenInfo={() => setInfo((v) => !v)}
            infoOpen={info}
          />
        ) : (
          <div className="msgr-view-empty">
            <span style={{ fontSize: 54 }}>💬</span>
            <h2>Tes discussions</h2>
            <p className="muted">Choisis une conversation à gauche, ou écris à quelqu'un.</p>
            <div className="row" style={{ gap: 8, justifyContent: 'center' }}>
              <button type="button" onClick={() => setCreating('direct')}>✏️ Nouvelle discussion</button>
              <button type="button" className="secondary" onClick={() => setCreating('group')}>👥 Nouveau groupe</button>
            </div>
          </div>
        )}
      </main>
      {info && activeId && <ConversationInfo conversationId={activeId} onClose={() => setInfo(false)} onLeft={() => { setInfo(false); select(null); }} />}
      {creating && <NewChatModal initialTab={creating} onClose={() => setCreating(false)} onOpened={(id) => select(id)} />}
    </div>
  );
}
