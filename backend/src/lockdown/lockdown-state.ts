import * as fs from 'fs';
import * as path from 'path';

/**
 * État de l'« Alerte générale », gardé dans un fichier (pas dans la base : la base est vidée pendant le verrouillage) et lu de
 * façon synchrone au démarrage, avant tout le reste — un redémarrage du serveur ne déverrouille donc jamais le site.
 */
export type LockPhase = 'OFF' | 'LOCKING' | 'LOCKED' | 'RESTORING';

export interface LockState {
  phase: LockPhase;
  /** Moment du dernier verrouillage ; les connexions ouvertes avant cette date ne valent plus rien. */
  epoch: number;
  /** Valeur de `epoch` avant l'alerte en cours : rétablie si le verrouillage est annulé (les sessions ne sont alors pas coupées pour rien). */
  prevEpoch?: number;
  startedAt?: number;
  /** Fichier du coffre chiffré (nom seulement, dans LOCKDOWN_DIR). */
  vaultFile?: string;
  /** Empreinte qui permet de refuser un mauvais mot de passe tout de suite, sans lire le coffre. */
  verifier?: string;
  salt?: string;
  /** Le coffre a été relu et vérifié en entier : seulement alors les données en clair peuvent être effacées. */
  vaultVerified?: boolean;
  wiped?: boolean;
  step?: string;
  pct?: number;
  error?: string | null;
  lockedBy?: string;
  summary?: { tables: number; rows: number; files: number; bytes: number; vaultBytes?: number };
  unlockedAt?: number;
}

export const lockdownDir = () => path.resolve(process.env.LOCKDOWN_DIR ?? './storage/lockdown');
const stateFile = () => path.join(lockdownDir(), 'state.json');

class LockdownStateStore {
  private state: LockState = { phase: 'OFF', epoch: 0 };
  private onLockHooks: Array<() => void> = [];

  constructor() {
    try {
      const raw = fs.readFileSync(stateFile(), 'utf8');
      this.state = { phase: 'OFF', epoch: 0, ...JSON.parse(raw) };
    } catch { /* pas encore de fichier : site normal */ }
  }

  get current(): Readonly<LockState> { return this.state; }

  /** Vrai dès que le site doit refuser toute requête (verrouillage en cours, verrouillé, ou restauration en cours). */
  get blocking() { return this.state.phase !== 'OFF'; }

  /** Un jeton émis avant la dernière alerte générale est refusé (`iat` en secondes). */
  tokenRevoked(iat?: number) {
    return !!this.state.epoch && (typeof iat !== 'number' || iat * 1000 < this.state.epoch);
  }

  update(patch: Partial<LockState>) {
    this.state = { ...this.state, ...patch };
    this.persist();
  }

  replace(next: LockState) {
    this.state = next;
    this.persist();
  }

  private persist() {
    try {
      fs.mkdirSync(lockdownDir(), { recursive: true });
      const tmp = stateFile() + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(this.state, null, 2), { mode: 0o600 });
      fs.renameSync(tmp, stateFile());
    } catch (err: any) {
      // Ne pas pouvoir écrire l'état est grave : on le dit haut et fort, mais l'état en mémoire reste juste.
      console.error('[lockdown] impossible d\'écrire le fichier d\'état :', err?.message ?? err);
    }
  }

  /** Les passerelles WebSocket s'inscrivent ici pour couper toutes les connexions ouvertes au moment de l'alerte. */
  onLock(cb: () => void) { this.onLockHooks.push(cb); }
  fireLock() { for (const cb of this.onLockHooks) { try { cb(); } catch { /* ignoré */ } } }
}

export const lockState = new LockdownStateStore();
