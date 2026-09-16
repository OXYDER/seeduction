import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { api } from '../api/client';
import { useAuthStore } from '../store/auth';

export default function Profile() {
  const { id } = useParams();
  const me = useAuthStore((s) => s.user);
  const targetId = id ?? me?.id;
  const [profile, setProfile] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);

  useEffect(() => {
    if (!targetId) return;
    api.get(id ? `/users/${id}` : '/users/me').then((r) => setProfile(r.data));
    if (!id) api.get('/users/me/ratio-history').then((r) => setHistory(r.data));
  }, [id, targetId]);

  if (!profile) return <p className="muted">Chargement...</p>;

  const chartData = history.map((h) => ({
    date: new Date(h.takenAt).toLocaleDateString(),
    ratio: Number(h.downloaded) > 0 ? Number(h.uploaded) / Number(h.downloaded) : 0,
  }));

  return (
    <div className="grid">
      <h1>{profile.username}</h1>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <Card label="Ratio" value={profile.ratio ? profile.ratio.toFixed(2) : '∞'} />
        <Card label="Upload" value={`${(Number(profile.uploaded) / 1e9).toFixed(2)} Go`} />
        <Card label="Download" value={`${(Number(profile.downloaded) / 1e9).toFixed(2)} Go`} />
        <Card label="Bonus points" value={profile.bonusPoints?.toFixed(0) ?? 0} />
      </div>
      {!id && chartData.length > 0 && (
        <div className="panel">
          <h3>Évolution du ratio (30 jours)</h3>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={chartData}>
              <XAxis dataKey="date" stroke="#8b8f9c" fontSize={12} />
              <YAxis stroke="#8b8f9c" fontSize={12} />
              <Tooltip contentStyle={{ background: '#171a23', border: '1px solid #2a2e3a' }} />
              <Line type="monotone" dataKey="ratio" stroke="#5b8cff" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      {!id && (
        <div className="panel">
          <div className="muted">Ta passkey (garde-la secrète — elle est dans l'URL announce de tes .torrent) :</div>
          <code>{profile.passkey}</code>
        </div>
      )}
    </div>
  );
}

function Card({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="panel">
      <div className="muted">{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div>
    </div>
  );
}
