import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';

type Svc = 'ok' | 'degraded' | 'outage';
interface Data {
  overall: Svc | 'maintenance';
  maintenance: { message: string; endsAt: string } | null;
  components: { id: string; label: string; status: Svc }[];
  days: { date: string; status: 'ok' | 'degraded' | 'down' | 'nodata'; downMinutes: number }[];
  uptime30: number | null; uptime90: number | null;
  incidents: { title: string; severity: 'outage' | 'degraded'; startedAt: string; resolvedAt: string | null; duration: string; ongoing: boolean }[];
  version: string; serverTime: string;
}

const SVC: Record<Svc, { label: string; color: string; icon: string }> = {
  ok: { label: 'Opérationnel', color: '#34d399', icon: '✅' },
  degraded: { label: 'Dégradé', color: '#fbbf24', icon: '⚠️' },
  outage: { label: 'Panne', color: '#f87171', icon: '🔴' },
};
const DAY_COLOR: Record<string, string> = { ok: '#34d399', degraded: '#fbbf24', down: '#f87171', nodata: 'rgba(255,255,255,0.12)' };
const DAY_LABEL: Record<string, string> = { ok: 'Aucun problème', degraded: 'Ralentissements', down: 'Panne', nodata: 'Pas de données' };

const when = (iso: string) => new Date(iso).toLocaleString('fr-CA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/**
 * Page d'état publique (sans connexion) : « le site fonctionne-t-il ? ». Utile surtout pendant un déploiement : quand le serveur redémarre, la page l'annonce clairement
 * (au lieu d'une erreur) et se reconnecte toute seule.
 */
export default function Status() {
  const [data, setData] = useState<Data | null>(null);
  const [fails, setFails] = useState(0);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const timer = useRef(0);

  useEffect(() => {
    let stop = false;
    async function load() {
      let next = 30_000;
      try {
        const r = await axios.get<Data>('/api/system/public-status', { timeout: 8000 });
        if (stop) return;
        setData(r.data); setFails(0); setCheckedAt(new Date());
        if (r.data.overall !== 'ok') next = 10_000;
      } catch (e: any) {
        if (stop) return;
        // 503 « verrouillé » : l'alerte générale s'affiche ailleurs ; ici, tout échec compte comme « injoignable ».
        setFails((n) => n + 1); next = 8_000;
      }
      timer.current = window.setTimeout(load, next);
    }
    void load();
    return () => { stop = true; window.clearTimeout(timer.current); };
  }, []);

  const unreachable = fails >= 1;
  const overall: Svc | 'maintenance' | 'unreachable' = unreachable ? 'unreachable' : data?.overall ?? 'ok';
  const HEAD: Record<string, { text: string; sub: string; color: string; icon: string }> = {
    ok: { text: 'Le site fonctionne normalement', sub: 'Tous les services répondent.', color: '#34d399', icon: '✅' },
    degraded: { text: 'Le site fonctionne, avec des ralentissements', sub: 'Un service est dégradé : tout reste utilisable, l\'équipe est au courant.', color: '#fbbf24', icon: '⚠️' },
    outage: { text: 'Une panne est en cours', sub: 'L\'équipe est au courant et travaille à la résoudre.', color: '#f87171', icon: '🔴' },
    maintenance: { text: 'Mise à jour en cours', sub: data?.maintenance?.message ?? 'Le site peut être brièvement instable pendant la mise à jour. Merci de ta patience !', color: '#7dd3fc', icon: '🔧' },
    unreachable: { text: 'Le site redémarre ou est momentanément injoignable', sub: 'C\'est probablement une mise à jour : cette page se reconnecte toute seule, inutile de la recharger. Rien n\'est perdu.', color: '#fbbf24', icon: '🔌' },
  };
  const head = HEAD[overall];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg, #0a0e1c)', color: 'var(--text, #e8ecf8)', padding: '32px 16px' }}>
      <div style={{ maxWidth: 820, margin: '0 auto', display: 'grid', gap: 18 }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <h1 style={{ margin: 0 }}>📡 État de Seeduction</h1>
          <Link to="/" style={{ fontSize: 14 }}>← Retour au site</Link>
        </div>

        <div className="panel" style={{ borderLeft: '4px solid ' + head.color, display: 'grid', gap: 4 }} role="status" aria-live="polite">
          <div style={{ fontSize: 20, fontWeight: 800 }}><span aria-hidden>{head.icon}</span> {head.text}</div>
          <div className="muted">{head.sub}</div>
          {data?.maintenance && !unreachable && <div className="muted" style={{ fontSize: 13 }}>Fin prévue vers {new Date(data.maintenance.endsAt).toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' })}.</div>}
          <div className="muted" style={{ fontSize: 12 }}>{checkedAt ? 'Vérifié à ' + checkedAt.toLocaleTimeString('fr-CA') + ' · ' : ''}{unreachable ? 'nouvel essai toutes les 8 secondes' : 'se met à jour toute seule'}</div>
        </div>

        {data && (
          <>
            <div className="panel" style={{ display: 'grid', gap: 8 }}>
              <h3 style={{ margin: 0 }}>Services</h3>
              {data.components.map((c) => {
                const s = unreachable ? { ...SVC.outage, label: 'Injoignable' } : SVC[c.status];
                return (
                  <div key={c.id} className="row" style={{ justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <span>{c.label}</span>
                    <span style={{ color: s.color, fontWeight: 700 }}>{s.icon} {s.label}</span>
                  </div>
                );
              })}
            </div>

            <div className="panel" style={{ display: 'grid', gap: 8 }}>
              <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <h3 style={{ margin: 0 }}>Disponibilité sur 90 jours</h3>
                <span className="muted" style={{ fontSize: 13 }}>30 jours : <strong>{data.uptime30 !== null ? data.uptime30 + ' %' : '—'}</strong> · 90 jours : <strong>{data.uptime90 !== null ? data.uptime90 + ' %' : '—'}</strong></span>
              </div>
              <div style={{ display: 'flex', gap: 2, alignItems: 'stretch' }} aria-label="Grille de disponibilité des 90 derniers jours">
                {data.days.map((d) => (
                  <span key={d.date} title={d.date + ' : ' + DAY_LABEL[d.status] + (d.downMinutes ? ' (' + d.downMinutes + ' min)' : '')} style={{ flex: 1, height: 34, borderRadius: 2, background: DAY_COLOR[d.status], minWidth: 2 }} />
                ))}
              </div>
              <div className="row muted" style={{ justifyContent: 'space-between', fontSize: 12 }}><span>Il y a 90 jours</span><span>Aujourd'hui</span></div>
            </div>

            <div className="panel" style={{ display: 'grid', gap: 8 }}>
              <h3 style={{ margin: 0 }}>Incidents des 30 derniers jours</h3>
              {data.incidents.length === 0 ? <p className="muted" style={{ margin: 0 }}>Aucun incident. 🎉</p> : data.incidents.map((i, n) => (
                <div key={n} style={{ display: 'flex', gap: 10, justifyContent: 'space-between', flexWrap: 'wrap', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <span><strong>{i.title}</strong> <span style={{ color: i.severity === 'outage' ? '#f87171' : '#fbbf24' }}>· {i.severity === 'outage' ? 'panne' : 'ralentissements'}</span></span>
                  <span className="muted" style={{ fontSize: 13 }}>{when(i.startedAt)} · {i.ongoing ? 'en cours' : 'résolu (' + i.duration + ')'}</span>
                </div>
              ))}
            </div>
          </>
        )}

        <p className="muted" style={{ fontSize: 12, textAlign: 'center' }}>Une mise à jour du site dure en général 5 à 10 minutes : pendant ce temps, tu peux continuer à seeder, tes téléchargements en cours ne sont pas touchés.{data ? ' · Version ' + data.version : ''}</p>
      </div>
    </div>
  );
}
