import { useState } from 'react';
import { api } from '../api/client';

/** Mon anonymat : sur tout le site, sur les torrents que j'envoie (par défaut) et dans ma team. Chaque choix est enregistré tout de suite. */
export default function AnonymityPanel({ site, uploads, team }: { site: boolean; uploads: boolean; team: boolean }) {
  const [v, setV] = useState({ site, uploads, team });
  const [msg, setMsg] = useState('');
  async function set(k: 'site' | 'uploads' | 'team', value: boolean) {
    const prev = v;
    setV({ ...v, [k]: value }); setMsg('');
    try { await api.patch('/users/me/anonymity', { [k]: value }); setMsg('✓ Enregistré'); setTimeout(() => setMsg(''), 2500); }
    catch (e: any) { setV(prev); setMsg(e.response?.data?.message ?? 'Enregistrement impossible'); }
  }
  const row = (k: 'site' | 'uploads' | 'team', title: string, hint: string) => (
    <label className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
      <input type="checkbox" style={{ width: 'auto', marginTop: 4 }} checked={v[k]} onChange={(e) => set(k, e.target.checked)} />
      <span><strong>{title}</strong><span className="muted" style={{ display: 'block', fontSize: 12.5 }}>{hint}</span></span>
    </label>
  );
  return (
    <div className="panel" style={{ display: 'grid', gap: 10 }}>
      <h3 style={{ margin: 0 }}>🕶️ Mon anonymat</h3>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>L'équipe du site peut toujours savoir qui tu es. Pour les autres membres, tu apparais comme « Anonyme ».</p>
      {row('site', 'Anonyme sur le site', "Ton pseudo et ton avatar sont cachés partout (commentaires, forum, classements, recherche), et ta page de profil est fermée.")}
      {row('uploads', 'Mes torrents envoyés sont anonymes', "Le nom de l'envoyeur est caché sur chaque torrent que tu publies (tu peux le changer à chaque envoi).")}
      {row('team', 'Anonyme dans ma team', "Les autres membres de ta team ne voient pas ton nom ; seuls le chef et les officiers le voient.")}
      {msg && <span className="muted" style={{ fontSize: 12.5 }}>{msg}</span>}
    </div>
  );
}
