/**
 * Les jeux annoncent ici ce que fait un membre (il a tourné la roue, terminé le quiz...) sans rien connaître des défis : le service des défis écoute et compte.
 * Aucun événement ne naît d'une mise : les défis ne poussent jamais à jouer des points.
 */
import { EventEmitter } from 'events';

export type ChallengeEventName = 'wheel' | 'quiz' | 'quiz_correct' | 'quiz_perfect' | 'picks' | 'picks_won' | 'cards_open' | 'cards_daily' | 'free_play';

export interface ChallengeEvent {
  /** Compte principal du membre. */
  userId: string;
  event: ChallengeEventName;
  amount?: number;
  /** Jeu concerné (pour compter les jeux différents essayés) : wheel, quiz, picks, cards, slots, hilo, blackjack, dice. */
  game?: string;
}

export const challengeBus = new EventEmitter();

/** Annonce un événement ; ne lève jamais d'erreur (un défi ne doit jamais gêner un jeu). */
export function emitChallenge(e: ChallengeEvent): void {
  try { challengeBus.emit('challenge', e); } catch { /* ignoré */ }
}
