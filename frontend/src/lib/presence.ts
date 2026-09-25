// Statuts de présence partagés (profil, chat privé, chat public) : préférence choisie par le membre (voir StatusSwitcher)
// vs statut affiché aux autres (une préférence « Apparaître hors ligne », ou une vraie déconnexion, donnent OFFLINE).
export type PresencePreference = 'ONLINE' | 'AWAY' | 'BUSY' | 'INVISIBLE';
export type PublicStatus = 'ONLINE' | 'AWAY' | 'BUSY' | 'OFFLINE';

export const PRESENCE_OPTIONS: { value: PresencePreference; label: string; color: string; icon: string }[] = [
  { value: 'ONLINE', label: 'En ligne', color: '#22c55e', icon: '🟢' },
  { value: 'AWAY', label: 'Absent', color: '#eab308', icon: '🌙' },
  { value: 'BUSY', label: 'Occupé', color: '#ef4444', icon: '⛔' },
  { value: 'INVISIBLE', label: 'Apparaître hors ligne', color: '#6b7280', icon: '⚪' },
];

export const STATUS_COLOR: Record<PublicStatus, string> = {
  ONLINE: '#22c55e',
  AWAY: '#eab308',
  BUSY: '#ef4444',
  OFFLINE: '#6b7280',
};

export const STATUS_LABEL: Record<PublicStatus, string> = {
  ONLINE: 'En ligne',
  AWAY: 'Absent',
  BUSY: 'Occupé',
  OFFLINE: 'Hors ligne',
};
