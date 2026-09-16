import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';

export default function Leaderboard() {
  const [users, setUsers] = useState<any[]>([]);

  useEffect(() => {
    api.get('/users/leaderboard').then((r) => setUsers(r.data));
  }, []);

  return (
    <div className="grid">
      <h1>Classement</h1>
      <div className="panel">
        <table>
          <thead><tr><th>#</th><th>Utilisateur</th><th>Upload</th><th>Ratio</th><th>Bonus</th></tr></thead>
          <tbody>
            {users.map((u, i) => (
              <tr key={u.id}>
                <td>{i + 1}</td>
                <td><Link to={`/users/${u.id}`}>{u.username}</Link></td>
                <td>{(Number(u.uploaded) / 1e9).toFixed(2)} Go</td>
                <td>{u.ratio ? u.ratio.toFixed(2) : '∞'}</td>
                <td>{u.bonusPoints?.toFixed(0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
