import type { PrismaClient } from '@prisma/client';

type Db = Pick<PrismaClient, '$executeRaw' | 'user'>;

/**
 * Points venus d'un don : ils se dépensent normalement (boutique, pot, demandes, envois...) mais ne peuvent pas être misés à Mise-O-jeu.
 * `User.donatedPoints` est la part de `bonusPoints` qui vient d'un don. À chaque dépense on retire d'abord cette part : le membre garde
 * ainsi le plus possible de points misables, et un point de don ne finit jamais dans une caisse de paris.
 */
export async function spendDonatedFirst(db: Db, userId: string, amount: number): Promise<void> {
  if (!(amount > 0)) return;
  await db.$executeRaw`UPDATE "User" SET "donatedPoints" = GREATEST(0, "donatedPoints" - ${amount}) WHERE "id" = ${userId}`;
}

/** Envoi de points entre membres : la part « don » voyage avec les points (sinon un compte pourrait blanchir ses points de don). À appeler dans la transaction, après le débit. */
export async function moveDonated(db: Db, fromId: string, toId: string, amount: number): Promise<void> {
  if (!(amount > 0)) return;
  const sender = await db.user.findUnique({ where: { id: fromId }, select: { donatedPoints: true } });
  const moved = Math.min(sender?.donatedPoints ?? 0, amount);
  if (moved <= 0) return;
  await db.$executeRaw`UPDATE "User" SET "donatedPoints" = GREATEST(0, "donatedPoints" - ${moved}) WHERE "id" = ${fromId}`;
  await db.$executeRaw`UPDATE "User" SET "donatedPoints" = "donatedPoints" + ${moved} WHERE "id" = ${toId}`;
}

/** Points qu'un membre peut miser : son solde moins la part venue d'un don. */
export const stakeable = (bonusPoints: number, donatedPoints: number): number => Math.max(0, Math.floor(bonusPoints - Math.min(donatedPoints, bonusPoints)));
