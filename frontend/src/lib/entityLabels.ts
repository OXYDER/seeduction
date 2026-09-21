export const ROLE_LABEL: Record<string, string> = {
  ACTOR: 'Acteurs',
  DIRECTOR: 'Réalisation',
  PRODUCER: 'Production',
  WRITER: 'Scénario',
  CREATOR: 'Créé par',
  ARTIST: 'Artistes',
  AUTHOR: 'Auteurs',
  STUDIO: 'Studios',
  NETWORK: 'Chaînes',
  LABEL: 'Label',
  PUBLISHER: 'Éditeur',
  DEVELOPER: 'Développeurs',
  GENRE: 'Genres',
  PLATFORM: 'Plateformes',
};

export const TYPE_LABEL: Record<string, string> = {
  PERSON: 'Personne',
  COMPANY: 'Société',
  GENRE: 'Genre',
  PLATFORM: 'Plateforme',
};

export function formatMinutes(min: number): string {
  return min >= 60 ? `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}` : `${min} min`;
}
