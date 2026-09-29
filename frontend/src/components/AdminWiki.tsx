import { useEffect, useState } from 'react';
import { api } from '../api/client';
import WysiwygEditor from './WysiwygEditor';

/** Wiki du site : catégories + articles (staff). Mirroré sur NewsAdmin/FreeleechAdmin. */
export function WikiAdmin() {
  const [tree, setTree] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  // Catégorie
  const [catName, setCatName] = useState('');
  const [catIcon, setCatIcon] = useState('');
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editCatName, setEditCatName] = useState('');
  const [editCatIcon, setEditCatIcon] = useState('');

  // Article
  const [editingId, setEditingId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [keywords, setKeywords] = useState('');
  const [isFaq, setIsFaq] = useState(false);
  const [editorKey, setEditorKey] = useState(0);

  const load = () => api.get('/wiki').then((r) => setTree(r.data));
  useEffect(() => { load(); }, []);

  function resetArticle() {
    setEditingId(null); setTitle(''); setContent(''); setKeywords(''); setIsFaq(false); setEditorKey((k) => k + 1);
  }

  async function createCategory() {
    setError(''); setMessage('');
    if (!catName.trim()) return;
    try {
      await api.post('/wiki/categories', { name: catName, icon: catIcon || undefined });
      setCatName(''); setCatIcon('');
      load();
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Création impossible');
    }
  }

  function startEditCategory(c: any) {
    setEditingCatId(c.id); setEditCatName(c.name); setEditCatIcon(c.icon ?? '');
  }

  async function saveCategory(id: string) {
    setError('');
    try {
      await api.patch(`/wiki/categories/${id}`, { name: editCatName, icon: editCatIcon || null });
      setEditingCatId(null);
      load();
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Modification impossible');
    }
  }

  async function removeCategory(id: string) {
    if (!window.confirm('Supprimer cette catégorie et tous ses articles ?')) return;
    setError('');
    try {
      await api.delete(`/wiki/categories/${id}`);
      load();
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Suppression impossible (contient peut-être des articles)');
    }
  }

  async function saveArticle() {
    setError(''); setMessage('');
    if (!categoryId || !title.trim() || !content.trim()) { setError('Catégorie, titre et contenu requis'); return; }
    try {
      if (editingId) await api.patch(`/wiki/articles/${editingId}`, { categoryId, title, content, keywords: keywords || null, isFaq });
      else await api.post('/wiki/articles', { categoryId, title, content, keywords: keywords || undefined, isFaq });
      setMessage(editingId ? '✓ Article modifié' : '✓ Article créé');
      resetArticle();
      load();
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Enregistrement impossible');
    }
  }

  function startEditArticle(a: any, catId: string) {
    setEditingId(a.id); setCategoryId(catId); setTitle(a.title); setKeywords(a.keywords ?? ''); setIsFaq(!!a.isFaq); setEditorKey((k) => k + 1);
    api.get(`/wiki/articles/${a.slug}`).then((r) => setContent(r.data.content));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function removeArticle(id: string) {
    if (!window.confirm('Supprimer cet article ?')) return;
    await api.delete(`/wiki/articles/${id}`).catch(() => {});
    if (editingId === id) resetArticle();
    load();
  }

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="panel">
        <h3>🗂️ Catégories du wiki</h3>
        <div className="row" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
          <input placeholder="Icône (emoji)" value={catIcon} onChange={(e) => setCatIcon(e.target.value)} style={{ width: 90 }} maxLength={4} />
          <input placeholder="Nom de la catégorie" value={catName} onChange={(e) => setCatName(e.target.value)} style={{ flex: 1 }} />
          <button type="button" onClick={createCategory}>Ajouter</button>
        </div>
        {error && <div className="muted" style={{ color: 'var(--danger)', marginBottom: 8 }}>{error}</div>}
        {tree.map((c) => (
          <div key={c.id} className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
            {editingCatId === c.id ? (
              <>
                <input value={editCatIcon} onChange={(e) => setEditCatIcon(e.target.value)} style={{ width: 90 }} maxLength={4} />
                <input value={editCatName} onChange={(e) => setEditCatName(e.target.value)} style={{ flex: 1 }} />
                <div className="row">
                  <button onClick={() => saveCategory(c.id)}>Enregistrer</button>
                  <button className="secondary" onClick={() => setEditingCatId(null)}>Annuler</button>
                </div>
              </>
            ) : (
              <>
                <span>{c.icon} <strong>{c.name}</strong> <span className="muted">({c.articles.length} article{c.articles.length > 1 ? 's' : ''})</span></span>
                <div className="row">
                  <button className="secondary" onClick={() => startEditCategory(c)}>Éditer</button>
                  <button className="danger" onClick={() => removeCategory(c.id)}>Supprimer</button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      <div className="panel">
        <h3>{editingId ? '✏️ Modifier l\'article' : '📝 Nouvel article'}</h3>
        <div className="grid" style={{ gap: 10 }}>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} style={{ flex: 1, minWidth: 200 }}>
              <option value="">— Choisir une catégorie —</option>
              {tree.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
            </select>
            <label className="row muted" style={{ gap: 6 }}>
              <input type="checkbox" style={{ width: 'auto' }} checked={isFaq} onChange={(e) => setIsFaq(e.target.checked)} /> Afficher aussi dans la FAQ
            </label>
          </div>
          <input placeholder="Titre de l'article" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
          <input placeholder="Mots-clés supplémentaires pour la recherche (séparés par des virgules)" value={keywords} onChange={(e) => setKeywords(e.target.value)} />
          <WysiwygEditor key={editorKey} value={content} onChange={setContent} minHeight={300} placeholder="Contenu de l'article (BBCode)..." />
          {message && <div className="muted" style={{ color: 'var(--success)' }}>{message}</div>}
          <div className="row">
            <button type="button" onClick={saveArticle}>{editingId ? 'Enregistrer' : 'Créer'}</button>
            {editingId && <button type="button" className="secondary" onClick={resetArticle}>Annuler</button>}
          </div>
        </div>
      </div>

      <div className="panel">
        <h3>Tous les articles</h3>
        <table>
          <tbody>
            {tree.flatMap((c) => c.articles.map((a: any) => (
              <tr key={a.id}>
                <td>{a.isFaq ? '⭐ ' : ''}{a.title}<div className="muted" style={{ fontSize: 12 }}>{c.icon} {c.name}</div></td>
                <td className="row" style={{ justifyContent: 'flex-end' }}>
                  <button className="secondary" onClick={() => startEditArticle(a, c.id)}>Éditer</button>
                  <button className="danger" onClick={() => removeArticle(a.id)}>Supprimer</button>
                </td>
              </tr>
            )))}
            {tree.every((c) => c.articles.length === 0) && <tr><td className="muted">Aucun article.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
