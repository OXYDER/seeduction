import { useState } from 'react';

/** Petite icône « copier » : copie le texte (nom d'une release, hash...) dans le presse-papiers et confirme d'un ✓. */
export default function CopyButton({ text, title = 'Copier', className }: { text: string; title?: string; className?: string }) {
  const [done, setDone] = useState(false);

  async function copy(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Contexte non sécurisé ou refus du navigateur : repli par une zone de texte temporaire.
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch { /* rien de plus à tenter */ }
      ta.remove();
    }
    setDone(true);
    setTimeout(() => setDone(false), 1400);
  }

  return (
    <button type="button" className={`copy-btn${done ? ' done' : ''}${className ? ` ${className}` : ''}`} title={done ? 'Copié !' : title} aria-label={title} onClick={copy}>
      {done ? '✓' : (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" />
        </svg>
      )}
    </button>
  );
}
