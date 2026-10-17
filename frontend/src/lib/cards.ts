/** Étiquette d'une valeur de carte : 2 à 10, puis J, Q, K et A (l'as est la carte la plus haute : 14). */
export const labelOf = (rank: number): string => ({ 11: 'J', 12: 'Q', 13: 'K', 14: 'A' } as Record<number, string>)[rank] ?? String(rank);
export const SUIT_NAME: Record<string, string> = { spade: 'pique', heart: 'cœur', diamond: 'carreau', club: 'trèfle' };
export const rankName = (rank: number): string => (rank === 14 ? 'l\'as' : rank === 13 ? 'le roi' : rank === 12 ? 'la dame' : rank === 11 ? 'le valet' : `le ${rank}`);
