import { useEffect } from 'react';
import { useAuthStore } from '../store/auth';
import { applyOrder, classicSort, NAV_CLASSIC_LABELS, useNavPrefs, type NavPrefs } from '../lib/navPrefs';
import { NAV_GROUPS, NAV_ITEMS } from './Layout';

const SIZES: [NavPrefs['size'], string][] = [['normal', 'Normaux'], ['large', 'Gros'], ['xl', 'Très gros']];
type Tri = 'auto' | 'yes' | 'no';
const toTri = (v: boolean | null): Tri => (v === null ? 'auto' : v ? 'yes' : 'no');
const fromTri = (v: string): boolean | null => (v === 'yes' ? true : v === 'no' ? false : null);

/** Profil > Compte > Menu de gauche : style (classique ou groupes), taille des liens, icônes, liens affichés, ordre. Chaque changement s'applique tout de suite et est enregistré sur le compte. */
export default function NavPrefsPanel() {
  const prefs = useNavPrefs((s) => s.prefs);
  const update = useNavPrefs((s) => s.update);
  const reset = useNavPrefs((s) => s.reset);
  const role = useAuthStore((s) => s.user?.role) ?? '';
  const staff = ['MODERATOR', 'SUPER_MODERATOR', 'ADMIN', 'OWNER'].includes(role);
  const admin = ['ADMIN', 'OWNER'].includes(role);

  useEffect(() => { if (window.location.hash === '#menu-gauche') document.getElementById('menu-gauche')?.scrollIntoView({ block: 'start' }); }, []);

  const classic = prefs.style === 'classic';
  const withExtras = prefs.extras ?? !classic;
  const pool = NAV_ITEMS.filter((i) => (!i.staffOnly || staff) && (!i.adminOnly || admin) && (withExtras || !i.sideOnly));
  const groupIdx = (g: string) => NAV_GROUPS.findIndex((x) => x.id === g);
  const base = classic ? classicSort(pool) : [...pool].sort((a, b) => groupIdx(a.group) - groupIdx(b.group));
  const rows = applyOrder(base, prefs.order);
  const label = (to: string, fallback: string) => (classic ? NAV_CLASSIC_LABELS[to] ?? fallback : fallback);

  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= rows.length) return;
    if (!classic && rows[i].group !== rows[j].group) return; // avec les groupes, l'ordre se règle à l'intérieur de chaque section
    const next = rows.map((r) => r.to);
    [next[i], next[j]] = [next[j], next[i]];
    update({ order: next });
  }
  const toggleHidden = (to: string) => update({ hidden: prefs.hidden.includes(to) ? prefs.hidden.filter((x) => x !== to) : [...prefs.hidden, to] });

  return (
    <div className="panel nav-prefs" id="menu-gauche" style={{ display: 'grid', gap: 14 }}>
      <div>
        <h3 style={{ margin: 0 }}>🧭 Menu de gauche</h3>
        <p className="muted" style={{ margin: '4px 0 0' }}>Choisis le style, la taille des liens et ce qui s'affiche. Tout s'applique tout de suite, sur tous tes appareils.</p>
      </div>

      <div className="np-cards">
        <button type="button" className={`np-card${classic ? ' on' : ''}`} onClick={() => update({ style: 'classic' })} aria-pressed={classic}>
          <strong>📋 Classique</strong>
          <span className="muted">Une seule liste de gros liens, toujours visibles : Accueil, Parcourir, Nouvelles, Envoyer, Chat, Forums… Rien à ouvrir ni à replier.</span>
        </button>
        <button type="button" className={`np-card${!classic ? ' on' : ''}`} onClick={() => update({ style: 'groups' })} aria-pressed={!classic}>
          <strong>🗂️ En groupes</strong>
          <span className="muted">Sections colorées qui se replient (Catalogue, Ma bibliothèque, Communauté, Jeux…) avec plus de liens, comme Mes séries ou chaque jeu.</span>
        </button>
      </div>

      <div style={{ display: 'grid', gap: 6 }}>
        <strong>Taille des liens</strong>
        <div className="np-seg">
          {SIZES.map(([k, l]) => <button key={k} type="button" className={prefs.size === k ? '' : 'secondary'} onClick={() => update({ size: k })}>{l}</button>)}
        </div>
      </div>

      <div style={{ display: 'grid', gap: 8 }}>
        <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={prefs.icons} onChange={(e) => update({ icons: e.target.checked })} /> Afficher les icônes devant les liens</label>
        {!classic && <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={prefs.openAll} onChange={(e) => update({ openAll: e.target.checked })} /> Garder toutes les sections ouvertes</label>}
        <label className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          Liens supplémentaires (Mes séries, Téléchargements en cours, Mon profil, chaque jeu…)
          <select value={toTri(prefs.extras)} onChange={(e) => update({ extras: fromTri(e.target.value) })} style={{ width: 'auto' }}>
            <option value="auto">Automatique ({classic ? 'cachés' : 'affichés'} avec ce style)</option>
            <option value="yes">Toujours afficher</option>
            <option value="no">Ne pas afficher</option>
          </select>
        </label>
        <label className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          Une entrée par catégorie (Films, Séries…) sous Parcourir
          <select value={toTri(prefs.categories)} onChange={(e) => update({ categories: fromTri(e.target.value) })} style={{ width: 'auto' }}>
            <option value="auto">Automatique ({classic ? 'cachées' : 'affichées'} avec ce style)</option>
            <option value="yes">Toujours afficher</option>
            <option value="no">Ne pas afficher</option>
          </select>
        </label>
      </div>

      <div style={{ display: 'grid', gap: 6 }}>
        <strong>Les liens du menu</strong>
        <span className="muted" style={{ fontSize: 13 }}>Décoche ceux dont tu n'as pas besoin, et utilise les flèches pour les réordonner.{!classic ? ' Avec les groupes, l\'ordre se règle à l\'intérieur de chaque section.' : ''}</span>
        <div className="np-list">
          {rows.map((r, i) => {
            const off = prefs.hidden.includes(r.to);
            return (
              <div key={r.to} className={`np-row${off ? ' off' : ''}`}>
                <label>
                  <input type="checkbox" checked={!off} onChange={() => toggleHidden(r.to)} />
                  <span aria-hidden="true">{r.icon}</span>
                  <span>{label(r.to, r.label)}</span>
                  {!classic && <span className="muted" style={{ fontSize: 12 }}>· {NAV_GROUPS.find((g) => g.id === r.group)?.label}</span>}
                </label>
                <button type="button" className="secondary" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Monter ${label(r.to, r.label)}`}>↑</button>
                <button type="button" className="secondary" onClick={() => move(i, 1)} disabled={i === rows.length - 1} aria-label={`Descendre ${label(r.to, r.label)}`}>↓</button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="secondary" onClick={() => update({ hidden: [], order: [] })} disabled={prefs.hidden.length === 0 && prefs.order.length === 0}>Remettre tous les liens à leur place</button>
        <button type="button" className="secondary" onClick={reset}>↺ Rétablir le menu d'origine</button>
      </div>
    </div>
  );
}
