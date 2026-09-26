import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { PRESENCE_OPTIONS, PresencePreference } from '../lib/presence';

/**
 * Panneau de choix du statut (En ligne / Absent / Occupé / Apparaître hors ligne) et de son message libre —
 * s'ouvre/se ferme de l'extérieur (voir Layout.tsx : tout le bloc avatar + nom l'ouvre au clic, pas seulement une
 * petite pastille). Ne dessine pas la pastille de couleur elle-même : c'est Layout.tsx qui s'en charge, pour
 * qu'elle reste bien collée à l'avatar même si ce panneau, lui, couvre toute la carte du membre.
 */
export default function StatusSwitcher({ value, statusText, open, onOpenChange, onChange }: {
  value?: PresencePreference;
  statusText?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChange?: (v: PresencePreference, text: string | null) => void;
}) {
  const [current, setCurrent] = useState<PresencePreference>(value ?? 'ONLINE');
  const [text, setText] = useState(statusText ?? '');
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { if (value) setCurrent(value); }, [value]);
  useEffect(() => { if (!open) setText(statusText ?? ''); }, [statusText, open]);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onOpenChange(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open, onOpenChange]);

  async function save(v: PresencePreference, t: string) {
    setBusy(true);
    try {
      const trimmed = t.trim() || null;
      await api.patch('/users/me/presence', { status: v, statusText: trimmed });
      setCurrent(v);
      onChange?.(v, trimmed);
      onOpenChange(false);
    } catch { /* le menu reste ouvert : le membre peut réessayer */ } finally { setBusy(false); }
  }

  if (!open) return null;

  return (
    <div
      ref={ref}
      className="panel ornate"
      style={{ position: 'absolute', left: 0, right: 0, top: '100%', marginTop: 8, zIndex: 90, padding: 10 }}
      onClick={(e) => e.stopPropagation()}
    >
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
      <Link to="/profile" className="muted" style={{ display: 'block', textAlign: 'center', marginTop: 8, fontSize: 12 }} onClick={() => onOpenChange(false)}>
        Voir mon profil →
      </Link>
    </div>
  );
}
