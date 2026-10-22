import { useEffect, useState } from 'react';
import { api } from '../api/client';

interface Cfg { chat: boolean; reactions: boolean; slowSeconds: number; maxLen: number; reactionsPerMinute: number; emojis: string[] }

/** Admin > Direct : chat et réactions pendant une diffusion, avec leurs limites. Les membres peuvent aussi tout couper chez eux d'un seul bouton dans le lecteur. */
export default function AdminLiveInteractions() {
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [emojis, setEmojis] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => { api.get('/admin/live').then((r) => { setCfg(r.data.interactions); setEmojis((r.data.interactions?.emojis ?? []).join(' ')); }).catch(() => setErr('Chargement impossible')); }, []);
  if (!cfg) return err ? <p style={{ color: 'var(--danger)' }}>{err}</p> : null;

  const num = (key: 'slowSeconds' | 'maxLen' | 'reactionsPerMinute', label: string, hint: string, min: number, max: number) => (
    <label style={{ display: 'grid', gap: 3, fontSize: 13 }}>{label}
      <input type="number" min={min} max={max} value={cfg[key]} onChange={(e) => setCfg({ ...cfg, [key]: Number(e.target.value) })} style={{ width: 110 }} />
      <span className="muted" style={{ fontSize: 11.5 }}>{hint}</span>
    </label>
  );

  async function save() {
    setMsg(''); setErr('');
    try {
      const list = emojis.split(/\s+/).map((e) => e.trim()).filter(Boolean);
      const r = (await api.put('/admin/live/interactions', { ...cfg, emojis: list })).data;
      setCfg(r); setEmojis(r.emojis.join(' ')); setMsg('✓ Réglages enregistrés');
    } catch (e: any) { setErr(e.response?.data?.message ?? 'Erreur'); }
  }

  return (
    <div className="panel" style={{ display: 'grid', gap: 10 }}>
      <h3 style={{ margin: 0 }}>💬 Chat et réactions pendant le direct</h3>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        Sur la page Direct, les membres voient le nombre de spectateurs, peuvent réagir avec des émojis (ils flottent sur l'image) et écrire dans un chat à côté du lecteur.
        Un bouton dans le lecteur coupe tout cela chez celui qui veut être tranquille. Rien n'est conservé : le chat repart à zéro à chaque diffusion. L'équipe peut supprimer un message ou réduire un membre au silence (10 minutes) directement dans le chat.
      </p>
      <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={cfg.chat} onChange={(e) => setCfg({ ...cfg, chat: e.target.checked })} /> Chat activé (les liens sont refusés, sauf pour l'équipe)</label>
      <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={cfg.reactions} onChange={(e) => setCfg({ ...cfg, reactions: e.target.checked })} /> Réactions activées</label>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {num('slowSeconds', 'Mode lent (secondes)', '0 = aucun délai ; au plus 6 messages par minute dans tous les cas', 0, 60)}
        {num('maxLen', 'Longueur d\'un message', 'caractères', 20, 500)}
        {num('reactionsPerMinute', 'Réactions par membre et par minute', 'et 3 par seconde au plus', 1, 120)}
      </div>
      <label style={{ display: 'grid', gap: 3, fontSize: 13 }}>Émojis proposés (séparés par des espaces, 12 au plus)
        <input value={emojis} onChange={(e) => setEmojis(e.target.value)} style={{ maxWidth: 420, fontSize: 18 }} />
      </label>
      <div className="row" style={{ gap: 10, alignItems: 'center' }}>
        <button type="button" onClick={save}>Enregistrer</button>
        {msg && <span style={{ color: 'var(--success)' }}>{msg}</span>}
        {err && <span style={{ color: 'var(--danger)' }}>{err}</span>}
      </div>
    </div>
  );
}
