import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../api/client';
import { bbcodeToHtml } from '../lib/bbcode';

const fmt = (iso: string) => new Date(iso).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });

/** Bandeau du haut : freeleech en cours (avec le message de l'événement) ou prochain événement annoncé. */
export default function FreeleechBanner() {
  const location = useLocation();
  const [state, setState] = useState<any>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    api.get('/bonus/freeleech').then((r) => setState(r.data)).catch(() => {});
  }, [location.pathname]);

  if (!state) return null;
  const next = state.upcoming?.[0];
  if (!state.until && !next) return null;

  const box: React.CSSProperties = {
    background: 'linear-gradient(90deg, rgba(74,222,128,0.18), rgba(224,184,74,0.18))',
    borderBottom: '1px solid var(--border-gold)', textAlign: 'center', padding: '6px 12px', fontSize: 13,
  };

  if (state.until) {
    return (
      <div style={box}>
        🎉 <strong>{state.event?.title ?? 'Freeleech global'}</strong> jusqu'au {fmt(state.until)} : les téléchargements ne comptent pas dans le ratio !
        {state.event?.message && (
          <>
            {' '}<button type="button" className="secondary" style={{ padding: '1px 10px', fontSize: 12 }} onClick={() => setOpen((v) => !v)}>{open ? 'Masquer' : 'En savoir plus'}</button>
            {open && <div className="bbcode-content" style={{ maxWidth: 720, margin: '8px auto 2px', textAlign: 'left' }} dangerouslySetInnerHTML={{ __html: bbcodeToHtml(state.event.message) }} />}
          </>
        )}
      </div>
    );
  }

  return (
    <div style={{ ...box, background: 'rgba(224,184,74,0.10)' }}>
      🗓️ Prochain freeleech : <strong>{next.title}</strong> — {fmt(next.startsAt)}
      {next.message && (
        <>
          {' '}<button type="button" className="secondary" style={{ padding: '1px 10px', fontSize: 12 }} onClick={() => setOpen((v) => !v)}>{open ? 'Masquer' : 'Détails'}</button>
          {open && <div className="bbcode-content" style={{ maxWidth: 720, margin: '8px auto 2px', textAlign: 'left' }} dangerouslySetInnerHTML={{ __html: bbcodeToHtml(next.message) }} />}
        </>
      )}
    </div>
  );
}
