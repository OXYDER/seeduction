import { TEMPORARY_FAILURE, failureReasonOf, isInternalError, isTransientError } from './tracker-errors';

const prismaError = (message: string, code?: string, name = 'PrismaClientKnownRequestError') => Object.assign(new Error(message), { code, name });

describe('Erreurs de l\'announce', () => {
  it('un refus voulu du tracker part tel quel au client', () => {
    expect(failureReasonOf(new Error('Passkey invalide'))).toBe('Passkey invalide');
    expect(isInternalError(new Error('Ratio trop bas'))).toBe(false);
  });

  it('une erreur Prisma n\'est jamais montrée au client', () => {
    const e = prismaError('Invalid `this.prisma.user.findUnique()` invocation in /app/dist/tracker/tracker.service.js:126:40\n\nThe column `User.donatedPoints` does not exist', 'P2022');
    expect(isInternalError(e)).toBe(true);
    expect(failureReasonOf(e)).toBe(TEMPORARY_FAILURE);
    expect(failureReasonOf(e)).not.toMatch(/prisma|app\/dist/i);
  });

  it('reconnaît aussi une erreur Prisma sans code', () => {
    expect(isInternalError(prismaError('Invalid `x` invocation', undefined, 'Error'))).toBe(true);
    expect(isInternalError(prismaError('boom', undefined, 'PrismaClientInitializationError'))).toBe(true);
  });

  it('repère les erreurs passagères de connexion', () => {
    expect(isTransientError(prismaError('Timed out fetching a new connection from the connection pool', 'P2024'))).toBe(true);
    expect(isTransientError(prismaError('Can\'t reach database server at `db:5432`', 'P1001'))).toBe(true);
    expect(isTransientError(prismaError('The column does not exist', 'P2022'))).toBe(false);
    expect(isTransientError(new Error('Passkey invalide'))).toBe(false);
  });

  it('un message absent donne un texte par défaut', () => {
    expect(failureReasonOf({})).toBe('Erreur tracker');
    expect(failureReasonOf(undefined)).toBe('Erreur tracker');
  });
});
