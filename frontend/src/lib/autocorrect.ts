/**
 * Correction automatique pendant la frappe dans les zones d'écriture (français) : fautes courantes d'accents, majuscule en début de
 * phrase, typographie (… ’ « » et espace insécable avant ? et !). Chaque correction passe par execCommand : elle s'annule avec Ctrl+Z.
 * Les adresses (http://, @pseudo, #...) ne sont jamais touchées.
 */

/** Fautes courantes SANS ambiguïté (le mot sans accent n'existe pas en français). */
const TYPOS: Record<string, string> = {
  tres: 'très', deja: 'déjà', apres: 'après', voila: 'voilà', ca: 'ça', meme: 'même', ete: 'été', bientot: 'bientôt',
  francais: 'français', francaise: 'française', francaises: 'françaises', quebec: 'Québec', quebecois: 'québécois', quebecoise: 'québécoise',
  probleme: 'problème', problemes: 'problèmes', systeme: 'système', telecharger: 'télécharger', telechargement: 'téléchargement', telechargements: 'téléchargements',
  qualite: 'qualité', ameliorer: 'améliorer', amelioration: 'amélioration', seeduction: 'Seeduction', developpeur: 'développeur',
  evenement: 'événement', evenements: 'événements', reponse: 'réponse', reponses: 'réponses', createur: 'créateur', creer: 'créer', desole: 'désolé',
};

const LETTER = /[A-Za-zÀ-ÿ]/;
const NBSP = ' ';

export function autocorrectKey(e: React.KeyboardEvent, root: HTMLElement | null): void {
  if (!root || e.ctrlKey || e.metaKey || e.altKey || e.nativeEvent.isComposing) return;
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount || !sel.isCollapsed) return;
  const range = sel.getRangeAt(0);
  const node = range.startContainer;
  // Zone vide : la toute première lettre prend une majuscule.
  if (node.nodeType !== Node.TEXT_NODE && root.contains(node) && (root.textContent ?? '') === '' && /^[a-zà-ÿ]$/.test(e.key)) {
    e.preventDefault();
    document.execCommand('insertText', false, e.key.toUpperCase());
    return;
  }
  if (node.nodeType !== Node.TEXT_NODE || !root.contains(node)) return;
  // Pas de correction dans du code, un lien ou un bloc de citation de code.
  if ((node.parentElement as HTMLElement).closest('code, pre, a')) return;
  const text = (node as Text).data;
  const offset = range.startOffset;
  const before = text.slice(0, offset);
  const prev = before.slice(-1);
  const key = e.key;

  /** Remplace les `back` caractères avant le curseur par `replacement` (annulable). */
  const replace = (back: number, replacement: string) => {
    const r = document.createRange();
    r.setStart(node, offset - back); r.setEnd(node, offset);
    sel.removeAllRanges(); sel.addRange(r);
    document.execCommand('insertText', false, replacement);
  };

  // ... → …
  if (key === '.' && before.endsWith('..') && !before.endsWith('...')) { e.preventDefault(); replace(2, '…'); return; }

  // Apostrophe et guillemets typographiques
  if (key === "'") { e.preventDefault(); document.execCommand('insertText', false, '’'); return; }
  if (key === '"') {
    e.preventDefault();
    const opening = before === '' || /[\s(\[{«]$/.test(before);
    document.execCommand('insertText', false, opening ? `«${NBSP}` : (/[\s ]$/.test(before) ? '»' : `${NBSP}»`));
    return;
  }

  const wordEnd = key === ' ' || key === 'Enter' || /^[.,;:!?)]$/.test(key);

  // Fin de mot : correction orthographique du mot qui vient d'être tapé (le caractère tapé s'ajoute ensuite normalement).
  // L'apostrophe n'empêche pas la correction (l’ete → l’été) ; les adresses, @pseudo, #tags et chemins sont ignorés.
  let fixed = false;
  if (wordEnd) {
    const m = /(^|[^A-Za-zÀ-ÿ0-9_@#/.:\-])([A-Za-zÀ-ÿ]+)$/.exec(before);
    if (m) {
      const word = m[2];
      const fix = TYPOS[word.toLowerCase()];
      if (fix && fix !== word) {
        const capital = word[0] !== word[0].toLowerCase() && fix[0] === fix[0].toLowerCase();
        const target = capital ? fix[0].toUpperCase() + fix.slice(1) : fix;
        replace(word.length, target);
        fixed = true;
      }
    }
  }

  // Espace insécable avant ? et ! (jamais après un autre signe de ponctuation)
  if ((key === '?' || key === '!') && before !== '' && !/[?!…  ]$/.test(before)) {
    // Après une correction de mot, `prev` ne reflète plus le texte : le mot corrigé se termine toujours par une lettre.
    if (fixed || LETTER.test(prev) || /[0-9»)]/.test(prev)) { e.preventDefault(); document.execCommand('insertText', false, `${NBSP}${key}`); return; }
  }
  if ((key === '?' || key === '!') && prev === ' ' && !/[?!…]\s$/.test(before)) { e.preventDefault(); replace(1, `${NBSP}${key}`); return; }

  // Pas de double espace
  if (key === ' ' && (prev === ' ' || prev === NBSP)) { e.preventDefault(); return; }

  if (wordEnd) return;

  // Majuscule au début d'une phrase
  if (/^[a-zà-ÿ]$/.test(key)) {
    const pre = document.createRange();
    pre.selectNodeContents(root); pre.setEnd(node, offset);
    const before2 = pre.toString();
    if (before2 === '' || /[.!?…]\s+$/.test(before2)) {
      e.preventDefault();
      document.execCommand('insertText', false, key.toUpperCase());
    }
  }
}
