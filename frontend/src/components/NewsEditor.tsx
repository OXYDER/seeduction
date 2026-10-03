import { useState } from 'react';
import { api } from '../api/client';
import WysiwygEditor from './WysiwygEditor';
import { NEWS_KINDS } from '../lib/news';

export interface NewsItem { id?: string; title: string; content: string; summary?: string | null; imageUrl?: string | null; pinned?: boolean; kind?: string; commentsLocked?: boolean }

/** Éditeur rapide d'une nouvelle (titre, chapeau, image principale, contenu, épinglage) — utilisé directement dans la page Nouvelles. */
export default function NewsEditor({ item, onSaved, onCancel }: { item?: NewsItem; onSaved: () => void; onCancel: () => void }) {
  const [title, setTitle] = useState(item?.title ?? '');
  const [summary, setSummary] = useState(item?.summary ?? '');
  const [imageUrl, setImageUrl] = useState<string | null>(item?.imageUrl ?? null);
  const [content, setContent] = useState(item?.content ?? '');
  const [pinned, setPinned] = useState(!!item?.pinned);
  const [kind, setKind] = useState(item?.kind ?? 'NEWS');
  const [locked, setLocked] = useState(!!item?.commentsLocked);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function upload(file?: File) {
    if (!file) return;
    const form = new FormData();
    form.append('file', file);
    try { const { data } = await api.post('/covers/upload', form); setImageUrl(data.url); }
    catch (err: any) { setError(err.response?.data?.message ?? "Échec du téléversement de l'image"); }
  }

  async function save() {
    setError('');
    if (!title.trim() || !content.trim()) { setError('Titre et contenu requis'); return; }
    setBusy(true);
    try {
      const body = { title, content, pinned, kind, commentsLocked: locked, summary: summary.trim() || null, imageUrl };
      if (item?.id) await api.patch(`/announcements/${item.id}`, body); else await api.post('/announcements', body);
      onSaved();
    } catch (err: any) { setError(err.response?.data?.message ?? 'Enregistrement impossible'); setBusy(false); }
  }

  async function remove() {
    if (!item?.id || !window.confirm('Supprimer cette nouvelle ?')) return;
    try { await api.delete(`/announcements/${item.id}`); onSaved(); } catch { setError('Suppression impossible'); }
  }

  return (
    <div className="panel ornate news-editor" style={{ display: 'grid', gap: 10 }}>
      <h3 style={{ margin: 0 }}>{item?.id ? '✏️ Modifier la nouvelle' : '📰 Nouvelle nouvelle'}</h3>
      <input placeholder="Titre" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
      <textarea placeholder="Chapeau : une ou deux phrases affichées dans les listes (facultatif)" value={summary} onChange={(e) => setSummary(e.target.value)} maxLength={300} rows={2} />
      <div className="row" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        {imageUrl ? <img src={imageUrl} alt="" className="news-edit-thumb" /> : <div className="news-edit-thumb empty">Pas d'image</div>}
        <label className="secondary fam-file">🖼️ {imageUrl ? "Changer l'image principale" : 'Ajouter une image principale'}<input type="file" accept="image/*" hidden onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ''; }} /></label>
        {imageUrl && <button type="button" className="secondary" onClick={() => setImageUrl(null)}>Retirer</button>}
      </div>
      <WysiwygEditor value={content} onChange={setContent} minHeight={220} placeholder="Contenu de la nouvelle..." />
      <div className="row" style={{ gap: 14, flexWrap: 'wrap' }}>
        <label className="row muted" style={{ gap: 6 }}>Type :
          <select value={kind} onChange={(e) => setKind(e.target.value)}>{Object.entries(NEWS_KINDS).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}</select>
        </label>
        <label className="row muted" style={{ gap: 6 }}><input type="checkbox" style={{ width: 'auto' }} checked={pinned} onChange={(e) => setPinned(e.target.checked)} /> 📌 Épingler en haut</label>
        <label className="row muted" style={{ gap: 6 }}><input type="checkbox" style={{ width: 'auto' }} checked={locked} onChange={(e) => setLocked(e.target.checked)} /> 🔒 Fermer les commentaires</label>
      </div>
      {error && <div style={{ color: 'var(--danger)' }}>{error}</div>}
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <button type="button" disabled={busy} onClick={save}>{item?.id ? 'Enregistrer' : 'Publier'}</button>
        <button type="button" className="secondary" onClick={onCancel}>Annuler</button>
        {item?.id && <button type="button" className="danger" style={{ marginLeft: 'auto' }} onClick={remove}>Supprimer</button>}
      </div>
      {!item?.id && <p className="muted" style={{ margin: 0, fontSize: 12 }}>À la publication, tous les membres reçoivent une notification.</p>}
    </div>
  );
}
