import { forwardRef, useImperativeHandle, useLayoutEffect, useRef } from 'react';
import { AUTO_FORMATS, QUOTE_CLASS, SPOILER_CLASS, ZW, editorToMd, mdToEditorHtml } from '../../lib/chatEditorFormat';

export type ChatFormat = 'bold' | 'italic' | 'strike' | 'code' | 'spoiler' | 'quote';

export interface ChatEditorHandle {
  focus: () => void;
  /** Insère du texte brut au curseur (émojis...). */
  insertText: (text: string) => void;
  format: (f: ChatFormat) => void;
  /** Début de pseudo tapé juste avant le curseur (« @mar »), ou null. */
  mentionQuery: () => string | null;
  /** Remplace le « @début » tapé avant le curseur par « @pseudo ». */
  replaceMention: (username: string) => void;
}

interface Props {
  /** Texte au format Markdown léger (la valeur envoyée). */
  value: string;
  onChange: (md: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  onPaste?: (e: React.ClipboardEvent<HTMLDivElement>) => void;
  placeholder?: string;
  maxLength?: number;
}

const MENTION_AT_CARET = /(^|\s)@([\p{L}\p{N}_.·-]{0,50})$/u;
const exec = (cmd: string, value?: string) => document.execCommand(cmd, false, value);
const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function caretToEnd(el: HTMLElement) {
  const sel = window.getSelection();
  if (!sel) return;
  const r = document.createRange();
  r.selectNodeContents(el);
  r.collapse(false);
  sel.removeAllRanges();
  sel.addRange(r);
}

/**
 * Champ de saisie du chat qui montre la mise en forme en direct (gras, italique, barré, code, spoiler, citation) au lieu de marqueurs : on écrit « en gras »
 * et ça s'affiche en gras. La valeur échangée reste le Markdown léger de chatFormat.tsx. Les marqueurs tapés à la main (**mot**, *mot*, `mot`...) se
 * transforment d'eux-mêmes dès qu'ils sont fermés.
 */
const ChatEditor = forwardRef<ChatEditorHandle, Props>(function ChatEditor({ value, onChange, onKeyDown, onPaste, placeholder, maxLength = 4000 }, handle) {
  const ref = useRef<HTMLDivElement>(null);
  const last = useRef('');
  const composing = useRef(false);

  // Valeur modifiée de l'extérieur (brouillon, modification d'un message, envoi...) : on réécrit le champ ; ce qu'on a nous-mêmes émis est déjà affiché.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || value === last.current) return;
    el.innerHTML = mdToEditorHtml(value);
    last.current = value;
    if (document.activeElement === el) caretToEnd(el);
  }, [value]);

  function emit() {
    const el = ref.current;
    if (!el) return;
    let md = editorToMd(el);
    if (!md.trim() && el.innerHTML !== '') { el.innerHTML = ''; md = ''; } // un champ vidé laisse parfois un <br> : on le retire (le texte d'aide en dépend)
    if (md === last.current) return;
    last.current = md;
    onChange(md);
  }

  /** « **mot** » tapé à la main : remplacé par du gras (en gardant l'annulation Ctrl+Z). */
  function autoFormat() {
    const sel = window.getSelection();
    if (!sel || !sel.isCollapsed || !sel.anchorNode || sel.anchorNode.nodeType !== Node.TEXT_NODE) return;
    const node = sel.anchorNode as Text;
    if (!ref.current?.contains(node) || node.parentElement?.closest('code')) return;
    const before = (node.nodeValue ?? '').slice(0, sel.anchorOffset);
    for (const f of AUTO_FORMATS) {
      const m = f.re.exec(before);
      if (!m) continue;
      const r = document.createRange();
      r.setStart(node, sel.anchorOffset - m[0].length);
      r.setEnd(node, sel.anchorOffset);
      sel.removeAllRanges();
      sel.addRange(r);
      exec('insertHTML', f.html(m[1]) + ZW);
      return;
    }
  }

  function onInput(e: React.FormEvent<HTMLDivElement>) {
    const t = (e.nativeEvent as InputEvent).inputType ?? '';
    if (!composing.current && t === 'insertText') autoFormat();
    emit();
  }

  // Longueur maximale : React ne transmet pas le type de saisie de « beforeinput », on écoute donc l'évènement natif.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const guard = (ev: Event) => {
      const t = (ev as InputEvent).inputType ?? '';
      if (t.startsWith('insert') && t !== 'insertCompositionText' && (el.textContent?.length ?? 0) >= maxLength) ev.preventDefault();
    };
    el.addEventListener('beforeinput', guard);
    return () => el.removeEventListener('beforeinput', guard);
  }, [maxLength]);

  const selectionInEditor = () => {
    const sel = window.getSelection();
    return sel && sel.rangeCount && ref.current?.contains(sel.anchorNode) ? sel : null;
  };

  /** Ligne (ou ligne vide) du curseur, au premier niveau du champ : { start, end } = indices des nœuds qui la composent. */
  function currentLine(el: HTMLElement, sel: Selection) {
    let node: Node | null = sel.anchorNode;
    while (node && node.parentNode !== el) node = node.parentNode;
    const kids = [...el.childNodes];
    let idx = node ? kids.indexOf(node as ChildNode) : kids.length - 1;
    if (idx < 0) idx = kids.length - 1;
    const isBreak = (n?: ChildNode) => !n || n.nodeName === 'BR' || n.nodeName === 'BLOCKQUOTE' || n.nodeName === 'DIV';
    if (kids[idx]?.nodeName === 'BR') return { start: idx, end: idx - 1, kids }; // ligne vide
    let start = idx, end = idx;
    while (start > 0 && !isBreak(kids[start - 1])) start--;
    while (end + 1 < kids.length && !isBreak(kids[end + 1])) end++;
    return { start, end, kids };
  }

  function toggleQuote() {
    const el = ref.current;
    const sel = el && selectionInEditor();
    if (!el || !sel) return;
    const quote = (sel.anchorNode instanceof Element ? sel.anchorNode : sel.anchorNode?.parentElement)?.closest('blockquote');
    if (quote && el.contains(quote)) {
      // Retirer la citation : son contenu redevient des lignes normales.
      const next = quote.nextSibling;
      const frag = document.createDocumentFragment();
      [...quote.childNodes].forEach((n) => frag.appendChild(n));
      if (next && next.nodeName !== 'BR' && next.nodeName !== 'BLOCKQUOTE') frag.appendChild(document.createElement('br'));
      quote.replaceWith(frag);
    } else {
      const kids0 = [...el.childNodes];
      const bq = document.createElement('blockquote');
      bq.className = QUOTE_CLASS;
      bq.dataset.f = 'quote';
      if (kids0.length === 0) {
        bq.appendChild(document.createTextNode(ZW));
        el.appendChild(bq);
      } else {
        const { start, end, kids } = currentLine(el, sel);
        if (end < start) {
          // Ligne vide : son <br> devient la citation.
          bq.appendChild(document.createTextNode(ZW));
          const br = kids[start];
          if (br) br.replaceWith(bq); else el.appendChild(bq);
        } else {
          const term = kids[end + 1];
          const nextRef = term && term.nodeName === 'BR' ? term.nextSibling : term ?? null;
          kids.slice(start, end + 1).forEach((n) => bq.appendChild(n));
          if (term && term.nodeName === 'BR') term.remove(); // le bloc se termine tout seul
          el.insertBefore(bq, nextRef);
        }
      }
      const r = document.createRange();
      r.selectNodeContents(bq);
      r.collapse(false);
      sel.removeAllRanges();
      sel.addRange(r);
    }
    emit();
  }

  /** Code et spoiler : entoure la sélection (ou, sans sélection, ouvre un élément où continuer d'écrire) ; un second clic dans l'élément le retire. */
  function toggleInline(kind: 'code' | 'spoiler') {
    const el = ref.current;
    const sel = el && selectionInEditor();
    if (!el || !sel) return;
    const sel0 = sel.anchorNode instanceof Element ? sel.anchorNode : sel.anchorNode?.parentElement;
    const host = sel0?.closest(kind === 'code' ? 'code' : '[data-f="spoiler"]');
    if (host && el.contains(host)) {
      const r = document.createRange();
      r.selectNode(host);
      sel.removeAllRanges();
      sel.addRange(r);
      exec('insertHTML', kind === 'code' ? escHtml(host.textContent?.replace(/​/g, '') ?? '') : host.innerHTML);
      return;
    }
    const wrapHtml = (inner: string) => (kind === 'code' ? `<code data-new>${inner}</code>` : `<span class="${SPOILER_CLASS}" data-f="spoiler" data-new>${inner}</span>`);
    if (sel.isCollapsed) {
      exec('insertHTML', wrapHtml(ZW) + ZW);
      const created = el.querySelector('[data-new]');
      if (created?.firstChild) {
        created.removeAttribute('data-new');
        const r = document.createRange();
        r.setStart(created.firstChild, 1);
        r.collapse(true);
        sel.removeAllRanges();
        sel.addRange(r);
      }
      return;
    }
    let inner: string;
    if (kind === 'code') inner = escHtml(sel.toString().replace(/​/g, ''));
    else { const box = document.createElement('div'); box.appendChild(sel.getRangeAt(0).cloneContents()); inner = box.innerHTML; }
    exec('insertHTML', wrapHtml(inner).replace(' data-new', '') + ZW);
  }

  useImperativeHandle(handle, () => ({
    focus: () => { const el = ref.current; if (!el) return; el.focus(); if (!selectionInEditor()) caretToEnd(el); },
    insertText: (text) => { const el = ref.current; if (!el) return; el.focus(); if (!selectionInEditor()) caretToEnd(el); exec('insertText', text); },
    format: (f) => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      if (!selectionInEditor()) caretToEnd(el);
      if (f === 'bold') exec('bold');
      else if (f === 'italic') exec('italic');
      else if (f === 'strike') exec('strikeThrough');
      else if (f === 'quote') toggleQuote();
      else toggleInline(f);
      emit();
    },
    mentionQuery: () => {
      const sel = selectionInEditor();
      if (!sel || !sel.isCollapsed || sel.anchorNode?.nodeType !== Node.TEXT_NODE) return null;
      const m = (sel.anchorNode.nodeValue ?? '').slice(0, sel.anchorOffset).match(MENTION_AT_CARET);
      return m ? m[2] : null;
    },
    replaceMention: (username) => {
      const sel = selectionInEditor();
      if (!sel || sel.anchorNode?.nodeType !== Node.TEXT_NODE) return;
      const node = sel.anchorNode as Text;
      const before = (node.nodeValue ?? '').slice(0, sel.anchorOffset);
      const m = MENTION_AT_CARET.exec(before);
      if (!m) return;
      const r = document.createRange();
      r.setStart(node, sel.anchorOffset - m[2].length - 1);
      r.setEnd(node, sel.anchorOffset);
      sel.removeAllRanges();
      sel.addRange(r);
      exec('insertText', `@${username} `);
    },
  }));

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if ((e.ctrlKey || e.metaKey) && !e.altKey) {
      const k = e.key.toLowerCase();
      if (!e.shiftKey && (k === 'b' || k === 'i' || k === 'e')) { e.preventDefault(); handleFormat(k === 'b' ? 'bold' : k === 'i' ? 'italic' : 'code'); return; }
      if (e.shiftKey && k === 'x') { e.preventDefault(); handleFormat('strike'); return; }
    }
    // Retour à la ligne vide dans une citation : on en sort.
    if (e.key === 'Enter' && e.shiftKey) {
      const sel = selectionInEditor();
      const quote = sel && (sel.anchorNode instanceof Element ? sel.anchorNode : sel.anchorNode?.parentElement)?.closest('blockquote');
      if (quote && sel!.isCollapsed) {
        const text = (quote.textContent ?? '').replace(/​/g, '');
        const lastIsBreak = quote.lastChild?.nodeName === 'BR' || /\n$/.test(text);
        if (lastIsBreak || !text) {
          e.preventDefault();
          if (quote.lastChild?.nodeName === 'BR') quote.lastChild.remove();
          const after = document.createTextNode(ZW);
          quote.after(after);
          const r = document.createRange();
          r.setStart(after, 1); r.collapse(true);
          sel!.removeAllRanges(); sel!.addRange(r);
          emit();
          return;
        }
      }
      e.preventDefault();
      exec('insertLineBreak');
      return;
    }
    onKeyDown?.(e);
  }
  function handleFormat(f: ChatFormat) {
    const el = ref.current;
    if (!el) return;
    if (f === 'bold') exec('bold');
    else if (f === 'italic') exec('italic');
    else if (f === 'strike') exec('strikeThrough');
    else if (f === 'quote') toggleQuote();
    else toggleInline(f);
    emit();
  }

  function handlePaste(e: React.ClipboardEvent<HTMLDivElement>) {
    if (e.clipboardData.files.length) { onPaste?.(e); return; }
    // Texte seulement : on ne garde jamais la mise en forme d'une autre page.
    e.preventDefault();
    const room = maxLength - (ref.current?.textContent?.length ?? 0);
    const text = e.clipboardData.getData('text/plain').replace(/\r\n?/g, '\n').slice(0, Math.max(0, room));
    // Du Markdown collé (« **gras** ») s'affiche mis en forme, comme s'il avait été tapé.
    if (text) { if (/[*_~|`>]/.test(text)) exec('insertHTML', mdToEditorHtml(text)); else exec('insertText', text); }
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    if (e.dataTransfer.files.length) return; // les fichiers sont gérés par la conversation
    e.preventDefault();
    const text = e.dataTransfer.getData('text/plain');
    if (text) exec('insertText', text);
  }

  return (
    <div
      ref={ref}
      className="msgr-editor"
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-multiline="true"
      aria-label="Message"
      data-placeholder={placeholder}
      spellCheck
      onInput={onInput}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      onDrop={handleDrop}
      onCompositionStart={() => { composing.current = true; }}
      onCompositionEnd={() => { composing.current = false; emit(); }}
    />
  );
});

export default ChatEditor;
