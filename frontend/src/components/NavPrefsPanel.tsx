import { useEffect } from 'react';
import { useAuthStore } from '../store/auth';
import { applyOrder, classicSort, NAV_CLASSIC_LABELS, NAV_DEFAULT_PINNED, useNavPrefs, type NavPrefs } from '../lib/navPrefs';
import { NAV_GROUPS, NAV_ITEMS } from './Layout';

const SIZES: [NavPrefs['size'], string][] = [['normal', 'Normaux'], ['large', 'Gros'], ['xl', 'Très gros']];
const STYLES: { key: NavPrefs['style']; icon: string; name: string; text: string }[] = [
  { key: 'classic', icon: '📋', name: 'Classique', text: "Une seule liste de gros liens, toujours visibles : Accueil, Parcourir, Nouvelles, Envoyer, Chat, Forums… Rien à ouvrir ni à replier." },
  { key: 'groups', icon: '🗂️', name: 'En groupes', text: 'Sections colorées qui se replient (Catalogue, Ma bibliothèque, Communauté, Jeux…) avec plus de liens, comme Mes séries ou chaque jeu.' },
  { key: 'pinned', icon: '⭐', name: 'Épinglés', text: "Seulement les liens que tu choisis (le plus court), et le reste est rangé sous « Tout le menu »." },
  { key: 'rail', icon: '🧭', name: 'Deux niveaux', text: "Une colonne d'icônes de sections, et un clic affiche leurs liens juste à côté." },
  { key: 'top', icon: '🔝', name: 'Barre du haut', text: "Menus déroulants en haut de l'écran : toute la largeur reste libre pour les pages. Sur téléphone, le menu habituel." },
];
type Tri = 'auto' | 'yes' | 'no';
const toTri = (v: boolean | null): Tri => (v === null ? 'auto' : v ? 'yes' : 'no');
const fromTri = (v: string): boolean | null => (v === 'yes' ? true : v === 'no' ? false : null);

/** Profil > Compte > Menu de gauche : style (cinq au choix), côté, taille des liens, icônes, liens affichés, épinglés, ordre. Chaque changement s'applique tout de suite et est enregistré sur le compte. */
export default function NavPrefsPanel() {
  const prefs = useNavPrefs((s) => s.prefs);
  const update = useNavPrefs((s) => s.update);
  const reset = useNavPrefs((s) => s.reset);
  const role = useAuthStore((s) => s.user?.role) ?? '';
  const staff = ['MODERATOR', 'SUPER_MODERATOR', 'ADMIN', 'OWNER'].includes(role);
  const admin = ['ADMIN', 'OWNER'].includes(role);

  useEffect(() => { if (window.location.hash === '#menu-gauche') document.getElementById('menu-gauche')?.scrollIntoView({ block: 'start' }); }, []);

  const flat = prefs.style === 'classic' || prefs.style === 'top'; // liste à plat (classique), ou dont l'ordre d'origine est celui de la liste à plat
  const groupish = prefs.style === 'groups' || prefs.style === 'pinned' || prefs.style === 'rail';
  const withExtras = prefs.extras ?? groupish;
  const everything = NAV_ITEMS.filter((i) => (!i.staffOnly || staff) && (!i.adminOnly || admin));
  const pool = everything.filter((i) => withExtras || !i.sideOnly);
  const groupIdx = (g: string) => NAV_GROUPS.findIndex((x) => x.id === g);
  const base = flat ? classicSort(pool) : [...pool].sort((a, b) => groupIdx(a.group) - groupIdx(b.group));
  const rows = applyOrder(base, prefs.order);
  const label = (to: string, fallback: string) => (prefs.style === 'classic' ? NAV_CLASSIC_LABELS[to] ?? fallback : fallback);
  const autoWord = groupish ? 'affichés' : 'cachés';

  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= rows.length) return;
    if (!flat && rows[i].group !== rows[j].group) return; // avec les sections, l'ordre se règle à l'intérieur de chacune
    const next = rows.map((r) => r.to);
    [next[i], next[j]] = [next[j], next[i]];
    update({ order: next });
  }
  const toggleHidden = (to: string) => update({ hidden: prefs.hidden.includes(to) ? prefs.hidden.filter((x) => x !== to) : [...prefs.hidden, to] });

  // Style Épinglés : les liens épinglés (ou la sélection de départ tant que rien n'est choisi).
  const pins = prefs.pinned.length ? prefs.pinned : NAV_DEFAULT_PINNED;
  const byTo = new Map(everything.map((i) => [i.to, i]));
  const pinnedItems = pins.map((to) => byTo.get(to)).filter((i): i is (typeof everything)[number] => !!i);
  const setPins = (next: string[]) => update({ pinned: next });
  const pinToggle = (to: string) => setPins(pins.includes(to) ? pins.filter((x) => x !== to) : [...pins, to]);
  const movePin = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= pinnedItems.length) return;
    const next = pinnedItems.map((p) => p.to);
    [next[i], next[j]] = [next[j], next[i]];
    setPins(next);
  };

  return (
    <div className="panel nav-prefs" id="menu-gauche" style={{ display: 'grid', gap: 14 }}>
      <div>
        <h3 style={{ margin: 0 }}>🧭 Menu de gauche</h3>
        <p className="muted" style={{ margin: '4px 0 0' }}>Choisis le style, la taille des liens et ce qui s'affiche. Tout s'applique tout de suite, sur tous tes appareils.</p>
      </div>

      <div className="np-cards">
        {STYLES.map((st) => (
          <button key={st.key} type="button" className={`np-card${prefs.style === st.key ? ' on' : ''}`} onClick={() => update({ style: st.key })} aria-pressed={prefs.style === st.key}>
            <strong>{st.icon} {st.name}</strong>
            <span className="muted">{st.text}</span>
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gap: 6 }}>
        <strong>Taille des liens</strong>
        <div className="np-seg">
          {SIZES.map(([k, l]) => <button key={k} type="button" className={prefs.size === k ? '' : 'secondary'} onClick={() => update({ size: k })}>{l}</button>)}
        </div>
      </div>

      {prefs.style !== 'top' && (
        <div style={{ display: 'grid', gap: 6 }}>
          <strong>Côté de l'écran</strong>
          <div className="np-seg">
            <button type="button" className={prefs.side === 'left' ? '' : 'secondary'} onClick={() => update({ side: 'left' })}>⬅ À gauche</button>
            <button type="button" className={prefs.side === 'right' ? '' : 'secondary'} onClick={() => update({ side: 'right' })}>À droite ➡</button>
          </div>
        </div>
      )}

      {prefs.style !== 'top' && (
        <div style={{ display: 'grid', gap: 6 }}>
          <strong>Largeur du menu</strong>
          <div className="row" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <input type="range" min={200} max={420} step={10} value={prefs.width || (prefs.style === 'rail' ? 340 : 252)} onChange={(e) => update({ width: Number(e.target.value) })} style={{ width: 'min(320px, 100%)' }} aria-label="Largeur du menu" />
            <span className="muted" style={{ fontSize: 13 }}>{prefs.width ? `${prefs.width} px` : 'Automatique'}</span>
            <button type="button" className="secondary" onClick={() => update({ width: 0 })} disabled={!prefs.width}>Automatique</button>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gap: 6 }}>
        <strong>Entre les liens</strong>
        <div className="np-seg">
          {([['normal', 'Normal'], ['lines', 'Séparés par une fine ligne'], ['airy', 'Aérés']] as [NavPrefs['spacing'], string][]).map(([k, l]) => (
            <button key={k} type="button" className={prefs.spacing === k ? '' : 'secondary'} onClick={() => update({ spacing: k })}>{l}</button>
          ))}
        </div>
      </div>

      {prefs.style === 'pinned' && (
        <div style={{ display: 'grid', gap: 6 }}>
          <strong>⭐ Mes liens épinglés</strong>
          <span className="muted" style={{ fontSize: 13 }}>Ce sont les seuls liens toujours visibles. Le reste est sous « Tout le menu ». Utilise les flèches pour les ordonner, ✕ pour en retirer un.</span>
          <div className="np-list">
            {pinnedItems.map((it, i) => (
              <div key={it.to} className="np-row">
                <label><span aria-hidden="true">{it.icon}</span><span>{NAV_CLASSIC_LABELS[it.to] ?? it.label}</span></label>
                <button type="button" className="secondary" onClick={() => movePin(i, -1)} disabled={i === 0} aria-label={`Monter ${it.label}`}>↑</button>
                <button type="button" className="secondary" onClick={() => movePin(i, 1)} disabled={i === pinnedItems.length - 1} aria-label={`Descendre ${it.label}`}>↓</button>
                <button type="button" className="secondary" onClick={() => pinToggle(it.to)} aria-label={`Retirer ${it.label}`}>✕</button>
              </div>
            ))}
          </div>
          <label className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            Ajouter un lien
            <select value="" onChange={(e) => { if (e.target.value) pinToggle(e.target.value); }} style={{ width: 'auto' }}>
              <option value="">Choisir…</option>
              {everything.filter((i) => !pins.includes(i.to)).map((i) => <option key={i.to} value={i.to}>{i.icon} {NAV_CLASSIC_LABELS[i.to] ?? i.label}</option>)}
            </select>
          </label>
        </div>
      )}

      <div style={{ display: 'grid', gap: 8 }}>
        <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={prefs.icons} onChange={(e) => update({ icons: e.target.checked })} /> Afficher les icônes devant les liens</label>
        {prefs.style === 'groups' && <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={prefs.openAll} onChange={(e) => update({ openAll: e.target.checked })} /> Garder toutes les sections ouvertes</label>}
        <label className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          Liens supplémentaires (Mes séries, Téléchargements en cours, Mon profil, chaque jeu…)
          <select value={toTri(prefs.extras)} onChange={(e) => update({ extras: fromTri(e.target.value) })} style={{ width: 'auto' }}>
            <option value="auto">Automatique ({autoWord} avec ce style)</option>
            <option value="yes">Toujours afficher</option>
            <option value="no">Ne pas afficher</option>
          </select>
        </label>
        <label className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          Une entrée par catégorie (Films, Séries…) sous Parcourir
          <select value={toTri(prefs.categories)} onChange={(e) => update({ categories: fromTri(e.target.value) })} style={{ width: 'auto' }}>
            <option value="auto">Automatique ({groupish ? 'affichées' : 'cachées'} avec ce style)</option>
            <option value="yes">Toujours afficher</option>
            <option value="no">Ne pas afficher</option>
          </select>
        </label>
      </div>

      <div style={{ display: 'grid', gap: 6 }}>
        <strong>Les liens du menu</strong>
        <span className="muted" style={{ fontSize: 13 }}>Décoche ceux dont tu n'as pas besoin, et utilise les flèches pour les réordonner.{!flat ? ' Avec les sections, l\'ordre se règle à l\'intérieur de chacune.' : ''}</span>
        <div className="np-list">
          {rows.map((r, i) => {
            const off = prefs.hidden.includes(r.to);
            return (
              <div key={r.to} className={`np-row${off ? ' off' : ''}`}>
                <label>
                  <input type="checkbox" checked={!off} onChange={() => toggleHidden(r.to)} />
                  <span aria-hidden="true">{r.icon}</span>
                  <span>{label(r.to, r.label)}</span>
                  {!flat && <span className="muted" style={{ fontSize: 12 }}>· {NAV_GROUPS.find((g) => g.id === r.group)?.label}</span>}
                </label>
                {prefs.style === 'pinned' && (
                  <button type="button" className={pins.includes(r.to) ? '' : 'secondary'} onClick={() => pinToggle(r.to)} title={pins.includes(r.to) ? 'Retirer des liens épinglés' : 'Épingler'} aria-label={`${pins.includes(r.to) ? 'Désépingler' : 'Épingler'} ${r.label}`}>⭐</button>
                )}
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
