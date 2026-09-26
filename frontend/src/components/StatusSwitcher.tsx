import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { PRESENCE_OPTIONS, PresencePreference } from '../lib/presence';

/**
 * Choix du statut affiché partout (profil, chat privé, chat public) : En ligne / Absent / Occupé / Apparaître hors
 * ligne, avec un petit message libre optionnel (ex. « En vacances jusqu'au 5 »). Le déclencheur couvre toute la
 * pastille d'avatar (pas seulement le petit point de couleur) : plus facile à cliquer que la version précédente.
 */
export default function StatusSwitcher({ value, statusText, onChange }: {
  value?: PresencePreference;
  statusText?: string | null;
  onChange?: (v: PresencePreference, text: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<PresencePreference>(value ?? 'ONLINE');
  const [text, setText] = useState(statusText ?? '');
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { if (value) setCurrent(value); }, [value]);
  useEffect(() => { if (!open) setText(statusText ?? ''); }, [statusText, open]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  async function save(v: PresencePreference, t: string) {
    setBusy(true);
    try {
      const trimmed = t.trim() || null;
      await api.patch('/users/me/presence', { status: v, statusText: trimmed });
      setCurrent(v);
      onChange?.(v, trimmed);
      setOpen(false);
    } catch { /* le menu reste ouvert : le membre peut réessayer */ } finally { setBusy(false); }
  }

  const option = PRESENCE_OPTIONS.find((o) => o.value === current) ?? PRESENCE_OPTIONS[0];

  // Positionné en absolu : le parent doit avoir `position: relative` (et, pour la pastille, une taille explicite).
  return (
    <div ref={ref}>
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((v) => !v); }}
        title={`Statut : ${option.label}${statusText ? ` — ${statusText}` : ''} (cliquer pour changer)`}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', borderRadius: '50%', background: 'transparent', border: 0, padding: 0, cursor: 'pointer', zIndex: 2 }}
      />
      <span
        aria-hidden="true"
        style={{
          position: 'absolute', right: -2, bottom: -2, width: 14, height: 14, borderRadius: '50%',
          background: option.color, border: '2px solid var(--bg-panel, #10162a)', pointerEvents: 'none', zIndex: 2,
        }}
      />
      {open && (
        <div className="panel ornate" style={{ position: 'absolute', left: 0, top: '130%', width: 240, zIndex: 90, padding: 10 }} onClick={(e) => e.stopPropagation()}>
          {PRESENCE_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              className="secondary"
              disabled={busy}
              style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', marginBottom: 3, fontWeight: current === o.value ? 700 : 400 }}
              onClick={() => { if (o.value !== current) save(o.value, text); }}
            >
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: o.color, flexShrink: 0 }} />
              {o.label}{current === o.value ? ' ✓' : ''}
            </button>
          ))}
          <div style={{ marginTop: 6, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
            <input
              type="text"
              value={text}
              maxLength={100}
              placeholder="Message de statut (optionnel)"
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') save(current, text); }}
              style={{ width: '100%' }}
            />
            <button type="button" disabled={busy} style={{ width: '100%', marginTop: 6 }} onClick={() => save(current, text)}>Enregistrer</button>
          </div>
        </div>
      )}
    </div>
  );
}
