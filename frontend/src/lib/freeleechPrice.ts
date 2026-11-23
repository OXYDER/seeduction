import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuthStore } from '../store/auth';

const STAFF = ['MODERATOR', 'SUPER_MODERATOR', 'ADMIN', 'OWNER'];

/** Prix en points d'un torrent en freeleech pour le membre connecté (0 pour le personnel), et son solde. */
export function useFreeleechPrice(): { price: number; points: number | null; text: string; left: number | null; blocked: boolean; quota: string } {
  const role = useAuthStore((s) => s.user?.role);
  const [info, setInfo] = useState<{ cost: number; points: number; max: number; used: number } | null>(null);
  useEffect(() => {
    let alive = true;
    api.get('/economy/me').then((r) => { if (alive) setInfo({ cost: Number(r.data?.rules?.uploadFreeleechCost ?? 0), points: Number(r.data?.points ?? 0), max: Number(r.data?.rules?.uploadFreeleechWeeklyMax ?? 0), used: Number(r.data?.freeleechWeekUsed ?? 0) }); }).catch(() => undefined);
    return () => { alive = false; };
  }, []);
  const price = role && STAFF.includes(role) ? 0 : info?.cost ?? 0;
  const text = price > 0 ? `${price} points bonus${info ? ` (tu en as ${Math.floor(info.points)})` : ''}` : 'gratuit';
  const left = price > 0 && info && info.max > 0 ? Math.max(0, info.max - info.used) : null;
  const quota = left === null || !info ? '' : left === 0 ? `limite de ${info.max} par semaine atteinte` : `${left} restant${left > 1 ? 's' : ''} cette semaine`;
  return { price, points: info?.points ?? null, text, left, blocked: left === 0, quota };
}
