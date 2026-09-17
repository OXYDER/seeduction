import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api/client';
import { useAuthStore } from '../store/auth';
import { bbcodeToHtml } from '../lib/bbcode';

export default function TorrentDetail() {
  const { id } = useParams();
  const [torrent, setTorrent] = useState<any>(null);
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    api.get(`/torrents/${id}`).then((r) => setTorrent(r.data));
  }, [id]);

  async function download() {
    const res = await api.get(`/torrents/${id}/download`, { responseType: 'blob' });
    const url = window.URL.createObjectURL(new Blob([res.data]));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${torrent.name}.torrent`;
    a.click();
  }

  if (!torrent) return <p className="muted">Chargement...</p>;

  const meta = [
    torrent.year, torrent.resolution, torrent.hdr ? 'HDR' : null, torrent.codec,
    torrent.audio, torrent.source, torrent.containerFormat, torrent.language,
    torrent.fps ? `${torrent.fps} fps` : null,
    torrent.durationMinutes ? `${torrent.durationMinutes} min` : null,
  ].filter(Boolean);

  return (
    <div className="grid">
      <h1>{torrent.name}</h1>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        {torrent.freeleech && <span className="badge freeleech">FREELEECH</span>}
        {torrent.doubleUpload && <span className="badge double">DOUBLE UPLOAD</span>}
        {meta.map((m, i) => <span key={i} className="badge new">{m}</span>)}
      </div>
      <div className="panel grid">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div>
            <div className="muted">Catégorie : {torrent.category?.name}</div>
            <div className="muted">Uploader : {torrent.anonymousUpload ? 'Anonyme' : torrent.uploader?.username}</div>
            <div className="muted">Seeders {torrent.seeders} / Leechers {torrent.leechers} / Complétés {torrent.completedCount}</div>
          </div>
          {user && <button onClick={download}>⬇ Télécharger le .torrent</button>}
        </div>
        {torrent.description && (
          <div dangerouslySetInnerHTML={{ __html: bbcodeToHtml(torrent.description) }} />
        )}
      </div>
      <div className="panel">
        <h3>Fichiers</h3>
        <table>
          <tbody>
            {(torrent.fileList ?? []).map((f: any, i: number) => (
              <tr key={i}><td>{f.path}</td><td className="muted">{f.size} o</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
