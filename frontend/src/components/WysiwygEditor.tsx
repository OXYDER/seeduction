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
const PALETTE = ['#ffffff', '#e9f2ea', '#bdbdbd', '#808080', '#000000', '#e0b84a', '#f5d67a', '#c2410c',
  '#ff5a5a', '#ff8a3d', '#ffd23d', '#4caf50', '#2dd4bf', '#5b8cff', '#a78bfa', '#f472b6'];
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
  const colorWrap = useRef<HTMLDivElement>(null);
  const [colorOpen, setColorOpen] = useState(false);
  const [hexInput, setHexInput] = useState('');
  // Dernière couleur utilisée + récentes, mémorisées pour les réappliquer en un clic.
  const [lastColor, setLastColor] = useState(() => {
    try { return localStorage.getItem('wysiwyg-color') || '#e0b84a'; } catch { return '#e0b84a'; }
  });
  const [recentColors, setRecentColors] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('wysiwyg-recent-colors') || '[]'); } catch { return []; }
  });

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

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (colorWrap.current && !colorWrap.current.contains(e.target as Node)) setColorOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
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

  function applyColor(raw: string) {
    const color = raw.toLowerCase();
    exec('foreColor', color);
    const recent = [color, ...recentColors.filter((c) => c !== color)].slice(0, 8);
    setLastColor(color);
    setRecentColors(recent);
    setColorOpen(false);
    try {
      localStorage.setItem('wysiwyg-color', color);
      localStorage.setItem('wysiwyg-recent-colors', JSON.stringify(recent));
    } catch {
      // Stockage indisponible : la couleur reste utilisable pour cette session.
    }
  }

  function applyHex() {
    const v = hexInput.trim();
    if (/^#?[0-9a-f]{6}$/i.test(v)) {
      applyColor(v.startsWith('#') ? v : `#${v}`);
      setHexInput('');
    }
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
        <div className="tb-color-wrap" ref={colorWrap}>
          <Btn title={`Appliquer la dernière couleur (${lastColor}) à la sélection`} onClick={() => applyColor(lastColor)}>
            <span style={{ fontWeight: 700, borderBottom: `3px solid ${lastColor}`, padding: '0 2px' }}>A</span>
          </Btn>
          <Btn title="Choisir une autre couleur" onClick={() => setColorOpen((v) => !v)}>▾</Btn>
          {colorOpen && (
            <div className="color-pop">
              {recentColors.length > 0 && (
                <>
                  <div className="muted" style={{ fontSize: 11, marginBottom: 4 }}>Récentes</div>
                  <div className="swatches">
                    {recentColors.map((c) => (
                      <button key={c} type="button" className="swatch" title={c} style={{ background: c }} onMouseDown={(e) => e.preventDefault()} onClick={() => applyColor(c)} />
                    ))}
                  </div>
                </>
              )}
              <div className="muted" style={{ fontSize: 11, margin: '8px 0 4px' }}>Palette</div>
              <div className="swatches">
                {PALETTE.map((c) => (
                  <button key={c} type="button" className="swatch" title={c} style={{ background: c }} onMouseDown={(e) => e.preventDefault()} onClick={() => applyColor(c)} />
                ))}
              </div>
              <div className="row" style={{ marginTop: 8, gap: 6 }}>
                <input type="color" title="Couleur personnalisée (puis OK)" value={/^#[0-9a-f]{6}$/i.test(hexInput) ? hexInput : lastColor} onChange={(e) => setHexInput(e.target.value)} className="color-native" />
                <input
                  placeholder="#e0b84a"
                  value={hexInput}
                  onChange={(e) => setHexInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyHex(); } }}
                  style={{ width: 90, padding: '4px 6px', fontSize: 12 }}
                />
                <Btn title="Appliquer ce code couleur" onClick={applyHex}>OK</Btn>
              </div>
            </div>
          )}
        </div>
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
