import { cleanChatText, DEFAULT_INTERACTIONS, LiveRoomState, normalizeInteractions } from './live-room';

const cfg = DEFAULT_INTERACTIONS;

describe('réglages des interactions', () => {
  it('garde des valeurs raisonnables', () => {
    const c = normalizeInteractions({ slowSeconds: 9999, maxLen: 5, reactionsPerMinute: 0, emojis: ['🔥', '🔥', '', 'x'.repeat(20), '👍'] });
    expect(c.slowSeconds).toBe(cfg.slowSeconds);
    expect(c.maxLen).toBe(cfg.maxLen);
    expect(c.reactionsPerMinute).toBe(cfg.reactionsPerMinute);
    expect(c.emojis).toEqual(['🔥', '👍']);
  });
  it('accepte les interrupteurs', () => {
    expect(normalizeInteractions({ chat: false, reactions: false })).toMatchObject({ chat: false, reactions: false });
  });
});

describe('nettoyage des messages', () => {
  it('retire les caractères de contrôle et les espaces en trop', () => {
    expect(cleanChatText('  Allez   les\u0000 Habs\n! ', 200)).toEqual({ text: 'Allez les Habs !' });
  });
  it('refuse le vide, le trop long et les liens (sauf pour l\'équipe)', () => {
    expect('error' in cleanChatText('   ', 200)).toBe(true);
    expect('error' in cleanChatText('a'.repeat(201), 200)).toBe(true);
    expect('error' in cleanChatText('regarde https://exemple.com', 200)).toBe(true);
    expect('error' in cleanChatText('va sur exemple.com', 200)).toBe(true);
    expect('error' in cleanChatText('regarde https://exemple.com', 200, true)).toBe(false);
    expect('error' in cleanChatText(42, 200)).toBe(true);
  });
});

describe('spectateurs', () => {
  it('un membre avec deux onglets compte une fois', () => {
    const r = new LiveRoomState();
    r.join('a', 's1'); r.join('a', 's2'); r.join('b', 's3');
    expect(r.count()).toBe(2);
    r.leave('s1');
    expect(r.count()).toBe(2);
    r.leave('s2');
    expect(r.count()).toBe(1);
  });
});

describe('chat', () => {
  it('mode lent et plafond par minute', () => {
    const r = new LiveRoomState();
    let t = 1_000_000;
    expect(r.canChat('a', cfg, t).ok).toBe(true);
    r.addChat({ userId: 'a', username: 'A', role: 'USER', text: 'salut' }, t);
    expect(r.canChat('a', cfg, t + 1000).ok).toBe(false); // mode lent : 3 s
    t += 3100;
    for (let i = 0; i < 5; i++) { expect(r.canChat('a', cfg, t).ok).toBe(true); r.addChat({ userId: 'a', username: 'A', role: 'USER', text: String(i) }, t); t += 3100; }
    expect(r.canChat('a', cfg, t).ok).toBe(false); // 6 messages dans la minute
    expect(r.canChat('b', cfg, t).ok).toBe(true); // un autre membre n'est pas touché
  });

  it('chat désactivé et membre réduit au silence', () => {
    const r = new LiveRoomState();
    expect(r.canChat('a', { ...cfg, chat: false }).ok).toBe(false);
    r.mute('a', 10, 1000);
    expect(r.canChat('a', cfg, 2000).ok).toBe(false);
    expect(r.canChat('a', cfg, 1000 + 11 * 60_000).ok).toBe(true);
  });

  it('garde les 50 derniers messages, et on peut en supprimer un', () => {
    const r = new LiveRoomState();
    const first = r.addChat({ userId: 'a', username: 'A', role: 'USER', text: 'm0' }, 1);
    for (let i = 1; i < 60; i++) r.addChat({ userId: 'b', username: 'B', role: 'USER', text: `m${i}` }, i + 1);
    expect(r.recent()).toHaveLength(50);
    expect(r.recent().some((m) => m.id === first.id)).toBe(false);
    const target = r.recent()[10];
    expect(r.deleteChat(target.id)).toBe(true);
    expect(r.recent().some((m) => m.id === target.id)).toBe(false);
    r.reset();
    expect(r.recent()).toEqual([]);
  });
});

describe('réactions', () => {
  it('seulement les émojis de la liste, 3 par seconde et N par minute', () => {
    const r = new LiveRoomState();
    let t = 5_000_000;
    expect(r.canReact('a', '💩', cfg, t).ok).toBe(false);
    expect(r.canReact('a', 42, cfg, t).ok).toBe(false);
    for (let i = 0; i < 3; i++) { expect(r.canReact('a', '🔥', cfg, t).ok).toBe(true); r.addReaction('a', '🔥', t); }
    expect(r.canReact('a', '🔥', cfg, t).ok).toBe(false); // 3 dans la même seconde
    const small = { ...cfg, reactionsPerMinute: 5 };
    t += 1500; r.addReaction('a', '🔥', t); r.addReaction('a', '🔥', t + 1);
    expect(r.canReact('a', '🔥', small, t + 2000).ok).toBe(false); // 5 dans la minute
    expect(r.canReact('a', '🔥', small, t + 61_000).ok).toBe(true);
    expect(r.canReact('a', '🔥', { ...cfg, reactions: false }, t).ok).toBe(false);
  });

  it('les envois groupés sont plafonnés et se vident', () => {
    const r = new LiveRoomState();
    for (let i = 0; i < 100; i++) r.addReaction(`u${i}`, '🔥', 1000);
    r.addReaction('x', '👏', 1000);
    expect(r.takeReactions()).toEqual({ '🔥': 12, '👏': 1 });
    expect(r.takeReactions()).toEqual({});
  });
});
