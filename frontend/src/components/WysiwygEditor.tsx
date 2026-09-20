import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { bbcodeToHtml } from '../lib/bbcode';
import { htmlToBbcode } from '../lib/htmlToBbcode';

interface WysiwygEditorProps {
  /** Contenu en BBCode (format stocké). */
  value: string;
  onChange: (bbcode: string) => void;
  placeholder?: string;
  minHeight?: number;
}

const SIZES = [1, 2, 3, 4, 5, 6, 7]; // même échelle que le BBCode : n*4+8 px
const EMOJIS = ['😀', '😍', '👍', '🔥', '⭐', '❤️', '🎬', '🎵', '📀', '🎮', '📚', '✅', '⚠️', '🆕', '🏆', '👑'];

// Les boutons ne doivent pas voler le focus/la sélection à la zone éditable.
function Btn({ title, onClick, children, disabled }: { title: string; onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button type="button" className="secondary tb-btn" title={title} onClick={onClick} disabled={disabled} onMouseDown={(e) => e.preventDefault()}>
      {children}
    </button>
  );
}

export default function WysiwygEditor({ value, onChange, placeholder, minHeight = 280 }: WysiwygEditorProps) {
  const ref = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const lastValue = useRef<string>('');
  const savedRange = useRef<Range | null>(null);
  const [sourceMode, setSourceMode] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Charge le BBCode dans la zone éditable uniquement quand la valeur change de
  // l'extérieur (nouvelle génération...) — pas à chaque frappe, sinon le curseur saute.
  useEffect(() => {
    if (!ref.current || value === lastValue.current) return;
    ref.current.innerHTML = bbcodeToHtml(value);
    lastValue.current = value;
  }, [value]);

  // Retient la dernière sélection dans l'éditeur, pour la restaurer quand on
  // clique sur un menu/sélecteur de couleur qui lui prend le focus.
  useEffect(() => {
    function save() {
      const sel = window.getSelection();
      if (sel && sel.rangeCount && ref.current?.contains(sel.anchorNode)) {
        savedRange.current = sel.getRangeAt(0).cloneRange();
      }
    }
    document.addEventListener('selectionchange', save);
    return () => document.removeEventListener('selectionchange', save);
  }, []);

  function sync() {
    if (!ref.current) return;
    const bbcode = htmlToBbcode(ref.current.innerHTML);
    lastValue.current = bbcode;
    onChange(bbcode);
  }

  function exec(command: string, arg?: string) {
    ref.current?.focus();
    const sel = window.getSelection();
    if (savedRange.current && sel && !ref.current?.contains(sel.anchorNode)) {
      sel.removeAllRanges();
      sel.addRange(savedRange.current);
    }
    document.execCommand(command, false, arg);
    sync();
  }

  function applySize(n: number) {
    exec('fontSize', '7');
    ref.current?.querySelectorAll('font[size="7"]').forEach((f) => {
      const span = document.createElement('span');
      span.style.fontSize = `${n * 4 + 8}px`;
      span.innerHTML = f.innerHTML;
      f.replaceWith(span);
    });
    sync();
  }

  function insertLink() {
    const url = prompt('Adresse du lien (https://...) :');
    if (!url || !/^https?:\/\//i.test(url)) return;
    const selected = window.getSelection()?.toString();
    if (selected) exec('createLink', url);
    else exec('insertHTML', `<a href="${url.replace(/"/g, '&quot;')}">${url.replace(/</g, '&lt;')}</a>`);
  }

  function insertImageUrl() {
    const url = prompt("Adresse de l'image (https://...) :");
    if (url && /^https?:\/\//i.test(url)) exec('insertImage', url);
  }

  async function uploadImage(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', f);
      const { data } = await api.post('/covers/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      exec('insertImage', data.url);
    } catch (err: any) {
      alert(err.response?.data?.message ?? "Impossible d'envoyer l'image");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="wysiwyg">
      <div className="wysiwyg-toolbar">
        <Btn title="Annuler" onClick={() => exec('undo')}>↶</Btn>
        <Btn title="Rétablir" onClick={() => exec('redo')}>↷</Btn>
        <span className="tb-sep" />
        <Btn title="Gras (Ctrl+B)" onClick={() => exec('bold')}><b>G</b></Btn>
        <Btn title="Italique (Ctrl+I)" onClick={() => exec('italic')}><i>I</i></Btn>
        <Btn title="Souligné (Ctrl+U)" onClick={() => exec('underline')}><u>S</u></Btn>
        <Btn title="Barré" onClick={() => exec('strikeThrough')}><s>B</s></Btn>
        <span className="tb-sep" />
        <select
          className="tb-btn"
          title="Taille du texte"
          value=""
          onChange={(e) => { if (e.target.value) applySize(Number(e.target.value)); }}
        >
          <option value="">Taille</option>
          {SIZES.map((n) => <option key={n} value={n}>{n * 4 + 8} px</option>)}
        </select>
        <label className="tb-btn tb-color" title="Couleur du texte">
          A
          <input type="color" defaultValue="#e0b84a" onChange={(e) => exec('foreColor', e.target.value)} />
        </label>
        <span className="tb-sep" />
        <Btn title="Aligner à gauche" onClick={() => exec('justifyLeft')}>⇤</Btn>
        <Btn title="Centrer" onClick={() => exec('justifyCenter')}>↔</Btn>
        <Btn title="Aligner à droite" onClick={() => exec('justifyRight')}>⇥</Btn>
        <span className="tb-sep" />
        <Btn title="Liste à puces" onClick={() => exec('insertUnorderedList')}>• Liste</Btn>
        <Btn title="Citation" onClick={() => exec('formatBlock', 'blockquote')}>❝ Citation</Btn>
        <Btn title="Bloc de code" onClick={() => exec('formatBlock', 'pre')}>{'</>'} Code</Btn>
        <Btn title="Ligne de séparation" onClick={() => exec('insertHorizontalRule')}>―</Btn>
        <span className="tb-sep" />
        <Btn title="Insérer un lien" onClick={insertLink}>🔗 Lien</Btn>
        <Btn title="Retirer le lien" onClick={() => exec('unlink')}>🔗✕</Btn>
        <Btn title="Image depuis une adresse" onClick={insertImageUrl}>🖼️ URL</Btn>
        <Btn title="Envoyer une image (sauvegardée sur Seeduction)" onClick={() => fileInput.current?.click()} disabled={uploading}>
          {uploading ? '...' : '📤 Image'}
        </Btn>
        <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={uploadImage} />
        <select
          className="tb-btn"
          title="Insérer un emoji"
          value=""
          onChange={(e) => { if (e.target.value) exec('insertText', e.target.value); }}
        >
          <option value="">😀</option>
          {EMOJIS.map((em) => <option key={em} value={em}>{em}</option>)}
        </select>
        <span className="tb-sep" />
        <Btn title="Effacer la mise en forme" onClick={() => exec('removeFormat')}>⌫ Format</Btn>
        <Btn title={sourceMode ? 'Revenir à l’éditeur visuel' : 'Voir / modifier le code BBCode'} onClick={() => setSourceMode((v) => !v)}>
          {sourceMode ? '👁️ Visuel' : '⌨️ BBCode'}
        </Btn>
      </div>

      <div
        ref={ref}
        className="wysiwyg-area bbcode-content"
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder ?? 'Écris ta description ici...'}
        onInput={sync}
        onBlur={sync}
        onPaste={(e) => {
          e.preventDefault();
          document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
        }}
        style={{ minHeight, display: sourceMode ? 'none' : 'block' }}
      />

      {sourceMode && (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          style={{ width: '100%', minHeight, fontFamily: 'monospace', fontSize: 12, resize: 'vertical' }}
        />
      )}
    </div>
  );
}
