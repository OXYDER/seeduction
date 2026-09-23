import { useState } from 'react';
import { api } from '../api/client';
import Avatar from './Avatar';

/** Mon profil : avatar (téléversé sur Seeduction) et signature affichée sous mes messages du forum. */
export default function ProfileEditor({ profile, onSaved }: { profile: any; onSaved: () => void }) {
  const [avatarUrl, setAvatarUrl] = useState<string>(profile.avatarUrl ?? '');
  const [signature, setSignature] = useState<string>(profile.signature ?? '');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function uploadAvatar(file: File | undefined) {
    if (!file) return;
    setError('');
    const form = new FormData();
    form.append('file', file);
    try {
      const { data } = await api.post('/covers/upload', form);
      setAvatarUrl(data.url);
    } catch (err: any) {
      setError(err.response?.data?.message ?? "Échec du téléversement de l'image");
    }
  }

  async function save() {
    setMessage(''); setError('');
    try {
      await api.patch('/users/me/profile', { avatarUrl: avatarUrl || null, signature });
      setMessage('✓ Profil enregistré');
      onSaved();
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Enregistrement impossible');
    }
  }

  return (
    <div className="panel">
      <h3>🖼️ Mon profil</h3>
      <div className="row" style={{ gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ textAlign: 'center' }}>
          <Avatar user={{ username: profile.username, avatarUrl }} size={96} />
          <label className="secondary" style={{ cursor: 'pointer', display: 'inline-block', marginTop: 8, padding: '5px 10px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 13 }}>
            Changer l'avatar
            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => uploadAvatar(e.target.files?.[0])} />
          </label>
          {avatarUrl && <div><button type="button" className="secondary" style={{ marginTop: 6, padding: '3px 10px', fontSize: 12 }} onClick={() => setAvatarUrl('')}>Retirer</button></div>}
        </div>
        <div style={{ flex: 1, minWidth: 260 }}>
          <div className="muted" style={{ marginBottom: 4 }}>Signature (affichée sous tes messages du forum, 500 caractères max, BBCode accepté)</div>
          <textarea rows={3} maxLength={500} value={signature} onChange={(e) => setSignature(e.target.value)} style={{ width: '100%' }} placeholder="Ex : [i]Toujours en seed ![/i]" />
          <div className="row" style={{ marginTop: 8 }}>
            <button type="button" onClick={save}>Enregistrer</button>
            {message && <span style={{ color: 'var(--success)' }}>{message}</span>}
            {error && <span style={{ color: 'var(--danger)' }}>{error}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
