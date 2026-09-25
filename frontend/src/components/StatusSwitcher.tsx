import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { PRESENCE_OPTIONS, PresencePreference } from '../lib/presence';

/** Choix du statut affiché partout (profil, chat privé, chat public) : En ligne / Absent / Occupé / Apparaître hors ligne. */
export default function StatusSwitcher({ value, onChange }: { value?: PresencePreference; onChange?: (v: PresencePreference) => void }) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<PresencePreference>(value ?? 'ONLINE');
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { if (value) setCurrent(value); }, [value]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  async function choose(v: PresencePreference) {
    if (v === current) { setOpen(false); return; }
    setBusy(true);
    try {
      await api.patch('/users/me/presence', { status: v });
      setCurrent(v);
      onChange?.(v);
    } catch { /* le menu reste ouvert : le membre peut réessayer */ } finally { setBusy(false); setOpen(false); }
  }

  const option = PRESENCE_OPTIONS.find((o) => o.value === current) ?? PRESENCE_OPTIONS[0];

  // Positionné en absolu : le parent doit avoir `position: relative` (et, pour la pastille, une taille explicite).
  return (
    <div ref={ref}>
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((v) => !v); }}
        title={`Statut : ${option.label} (cliquer pour changer)`}
        style={{
          position: 'absolute', right: -2, bottom: -2, width: 14, height: 14, borderRadius: '50%',
          background: option.color, border: '2px solid var(--bg-panel, #10162a)', padding: 0, cursor: 'pointer', zIndex: 2,
        }}
      />
      {open && (
        <div className="panel ornate" style={{ position: 'absolute', left: 0, top: '130%', width: 220, zIndex: 90, padding: 6 }} onClick={(e) => e.stopPropagation()}>
          {PRESENCE_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              className="secondary"
              disabled={busy}
              style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', marginBottom: 3, fontWeight: current === o.value ? 700 : 400 }}
              onClick={(e) => { e.preventDefault(); choose(o.value); }}
            >
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: o.color, flexShrink: 0 }} />
              {o.label}{current === o.value ? ' ✓' : ''}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
