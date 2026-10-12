import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../api/client';
import { notifyChanged } from '../lib/notifications';

/**
 * Ne rend rien : en ouvrant une page (sujet du forum, fiche de torrent, demandes, conversation...), les notifications qui mènent à cette page sont marquées lues
 * d'office. Sans cela, il fallait aller les cliquer une à une dans la cloche.
 */
export default function NotificationAutoRead() {
  const { pathname, search } = useLocation();
  useEffect(() => {
    const links = [...new Set([`${pathname}${search}`, pathname])];
    const t = window.setTimeout(() => {
      api.post('/notifications/read-by-link', { links }).then((r) => { if ((r.data?.count ?? 0) > 0) notifyChanged(); }).catch(() => {});
    }, 700);
    return () => window.clearTimeout(t);
  }, [pathname, search]);
  return null;
}
