import { useEffect, useState } from 'react';
import { api } from '../api/client';
import WysiwygEditor from './WysiwygEditor';
import { NEWS_KINDS } from '../lib/news';
import { canvasToBlob, drawBanner, loadLogo, type BannerKind } from '../lib/newsBanner';

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
  // Bannières instantanées (gratuites, dans le navigateur) : le vrai logo, le titre et les couleurs du type de nouvelle.
  const [banners, setBanners] = useState<string[]>([]);
  const [bannerBusy, setBannerBusy] = useState(false);
  const [bannerError, setBannerError] = useState('');

  async function makeBanners() {
    setBannerBusy(true); setBannerError('');
    try {
      const logo = await loadLogo();
      const canvas = document.createElement('canvas');
      const out: string[] = [];
      for (let variant = 0; variant < 3; variant++) {
        drawBanner(canvas, logo, { kind: kind as BannerKind, title, summary, variant });
        out.push(canvas.toDataURL('image/png'));
      }
      setBanners(out);
    } catch (err: any) { setBannerError(err?.message ?? 'Impossible de créer les bannières'); } finally { setBannerBusy(false); }
  }

  /** Choisir une bannière l'envoie sur Seeduction (comme une image téléversée) et la sélectionne. */
  async function pickBanner(dataUrl: string) {
    setBannerError('');
    try {
      const canvas = document.createElement('canvas');
      const img = new Image();
      await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('Image illisible')); img.src = dataUrl; });
      canvas.width = img.width; canvas.height = img.height;
      canvas.getContext('2d')!.drawImage(img, 0, 0);
      const blob = await canvasToBlob(canvas);
      const form = new FormData();
      form.append('file', new File([blob], 'banniere.png', { type: 'image/png' }));
      const { data } = await api.post('/covers/upload', form);
      setImageUrl(data.url);
    } catch (err: any) { setBannerError(err.response?.data?.message ?? err?.message ?? 'Enregistrement impossible'); }
  }

  // Image générée par l'IA (Gemini) : le logo de Seeduction est joint à chaque génération.
  const [ai, setAi] = useState<{ configured: boolean; logo: boolean } | null>(null);
  const [aiHint, setAiHint] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiImages, setAiImages] = useState<string[]>([]);
  const [aiError, setAiError] = useState('');
  useEffect(() => { api.get('/announcements/image-ai').then((r) => setAi(r.data)).catch(() => setAi(null)); }, []);

  async function generateImage() {
    setAiBusy(true); setAiError(''); setAiImages([]);
    try {
      const { data } = await api.post('/announcements/generate-image', { title, summary, content, kind, hint: aiHint, count: 2 }, { timeout: 150_000 });
      setAiImages(data.images.map((i: { url: string }) => i.url));
    } catch (err: any) { setAiError(err.response?.data?.message ?? "La génération a échoué"); } finally { setAiBusy(false); }
  }

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
      <div className="panel" style={{ display: 'grid', gap: 8, background: 'rgba(255,255,255,0.03)' }}>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <strong>🎨 Bannière instantanée</strong>
          <span className="muted" style={{ fontSize: 12 }}>Gratuite, sans service externe : le vrai logo de Seeduction, le titre et les couleurs du type de nouvelle.</span>
        </div>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <button type="button" disabled={bannerBusy || !title.trim()} onClick={makeBanners}>{bannerBusy ? 'Création…' : banners.length ? '🔄 Autres bannières' : '🎨 Créer 3 bannières'}</button>
          {!title.trim() && <span className="muted" style={{ fontSize: 12 }}>Écris d'abord le titre.</span>}
        </div>
        {bannerError && <div style={{ color: 'var(--danger)' }}>{bannerError}</div>}
        {banners.length > 0 && (
          <>
            <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
              {banners.map((u) => (
                <button key={u.slice(-60)} type="button" onClick={() => pickBanner(u)} title="Utiliser cette bannière" style={{ padding: 0, border: '3px solid transparent', borderRadius: 10, background: 'none', cursor: 'pointer', overflow: 'hidden' }}>
                  <img src={u} alt="Proposition de bannière" style={{ display: 'block', width: 300, maxWidth: '100%', aspectRatio: '16 / 9' }} />
                </button>
              ))}
            </div>
            <span className="muted" style={{ fontSize: 12 }}>Clique sur la bannière à utiliser, puis publie ou enregistre la nouvelle. Change le titre, le chapeau ou le type et recrée-les pour les mettre à jour.</span>
          </>
        )}
      </div>
      {ai && (
        <div className="panel" style={{ display: 'grid', gap: 8, background: 'rgba(255,255,255,0.03)' }}>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <strong>✨ Image par IA (Gemini, facultatif)</strong>
            <span className="muted" style={{ fontSize: 12 }}>Le logo de Seeduction est joint à chaque génération ; le titre, le résumé et le type de la nouvelle guident l'image.</span>
          </div>
          {!ai.configured ? (
            <p className="muted" style={{ margin: 0 }}>Non configurée : ajoute <code>GEMINI_API_KEY</code> dans <code>backend/.env</code> sur le serveur (voir le wiki).</p>
          ) : (
            <>
              <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                <input style={{ flex: 1, minWidth: 220 }} placeholder="Mots-clés en plus (facultatif) : ex. rouages, fête, bleu…" value={aiHint} onChange={(e) => setAiHint(e.target.value)} maxLength={200} />
                <button type="button" disabled={aiBusy || !title.trim()} onClick={generateImage}>{aiBusy ? 'Génération…' : aiImages.length ? '🔄 Régénérer' : '✨ Générer 2 images'}</button>
              </div>
              {!title.trim() && <span className="muted" style={{ fontSize: 12 }}>Écris d'abord le titre.</span>}
              {aiBusy && <span className="muted">Création en cours, compte 15 à 40 secondes…</span>}
              {aiError && <div style={{ color: 'var(--danger)' }}>{aiError}</div>}
              {aiImages.length > 0 && (
                <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
                  {aiImages.map((u) => (
                    <button key={u} type="button" onClick={() => setImageUrl(u)} title="Utiliser cette image" style={{ padding: 0, border: imageUrl === u ? '3px solid var(--acc-link, #b9a4ff)' : '3px solid transparent', borderRadius: 10, background: 'none', cursor: 'pointer', overflow: 'hidden' }}>
                      <img src={u} alt="Proposition d'image" style={{ display: 'block', width: 300, maxWidth: '100%', aspectRatio: '16 / 9', objectFit: 'cover' }} />
                    </button>
                  ))}
                </div>
              )}
              {aiImages.length > 0 && <span className="muted" style={{ fontSize: 12 }}>Clique sur l'image à utiliser, puis publie ou enregistre la nouvelle.</span>}
            </>
          )}
        </div>
      )}
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
