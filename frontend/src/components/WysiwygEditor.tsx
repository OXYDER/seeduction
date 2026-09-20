import { useEffect, useRef } from 'react';
import { bbcodeToHtml } from '../lib/bbcode';
import { htmlToBbcode } from '../lib/htmlToBbcode';

interface WysiwygEditorProps {
  value: string;
  onChange: (bbcode: string) => void;
  /** Appliqué seulement quand `value` change depuis l'extérieur (ex : nouvelle génération) — pas sur chaque frappe. */
  centerOnLoad?: boolean;
}

export default function WysiwygEditor({ value, onChange, centerOnLoad }: WysiwygEditorProps) {
  const ref = useRef<HTMLDivElement>(null);
  const lastValue = useRef<string>('');

  useEffect(() => {
    if (!ref.current || value === lastValue.current) return;
    ref.current.innerHTML = bbcodeToHtml(value);
    if (centerOnLoad) ref.current.style.textAlign = 'center';
    lastValue.current = value;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function sync() {
    if (!ref.current) return;
    const bbcode = htmlToBbcode(ref.current.innerHTML);
    lastValue.current = bbcode;
    onChange(bbcode);
  }

  function exec(command: string, arg?: string) {
    ref.current?.focus();
    document.execCommand(command, false, arg);
    sync();
  }

  function insertLink() {
    const url = prompt('Adresse du lien :');
    if (url) exec('createLink', url);
  }

  function insertImage() {
    const url = prompt("Adresse de l'image :");
    if (url) exec('insertImage', url);
  }

  return (
    <div>
      <div className="row" style={{ gap: 4, marginBottom: 6, flexWrap: 'wrap' }}>
        <button type="button" className="secondary" onClick={() => exec('bold')} title="Gras"><b>G</b></button>
        <button type="button" className="secondary" onClick={() => exec('italic')} title="Italique"><i>I</i></button>
        <button type="button" className="secondary" onClick={() => exec('underline')} title="Souligné"><u>S</u></button>
        <button type="button" className="secondary" onClick={() => exec('justifyCenter')}>↔ Centrer</button>
        <button type="button" className="secondary" onClick={() => exec('justifyLeft')}>⟸ Gauche</button>
        <button type="button" className="secondary" onClick={insertLink}>🔗 Lien</button>
        <button type="button" className="secondary" onClick={insertImage}>🖼️ Image</button>
      </div>
      <div
        ref={ref}
        contentEditable
        onInput={sync}
        onBlur={sync}
        style={{
          minHeight: 180,
          padding: 12,
          background: 'var(--bg-panel-raised)',
          border: '1px solid var(--border)',
          borderRadius: 6,
          outline: 'none',
          fontSize: 13,
          lineHeight: 1.5,
        }}
      />
    </div>
  );
}
