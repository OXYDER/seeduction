import { BadRequestException } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { ECONOMY } from './economy';
import { setSource } from './ledger';
import { spendDonatedFirst } from './points';

/** Le personnel (modération et plus) met un torrent en freeleech gratuitement ; les envoyeurs paient en points bonus. */
const STAFF_ROLES = ['MODERATOR', 'SUPER_MODERATOR', 'ADMIN', 'OWNER'];

/** Prix en points d'un torrent en freeleech pour ce rôle (0 = gratuit). */
export const freeleechPrice = (role: string | null | undefined): number => (role && STAFF_ROLES.includes(role) ? 0 : Math.max(0, Math.floor(ECONOMY.uploadFreeleechCost)));

/**
 * Débite le prix du freeleech d'envoyeur ; échoue sans rien changer si le membre n'a pas assez de points. Retourne le montant débité (0 si gratuit),
 * à rendre avec `refundUploaderFreeleech` si l'envoi échoue ensuite.
 */
export async function chargeUploaderFreeleech(prisma: PrismaClient, userId: string): Promise<number> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, bonusPoints: true } });
  if (!user) throw new BadRequestException('Membre introuvable');
  const price = freeleechPrice(user.role);
  if (price <= 0) return 0;
  await prisma.$transaction(async (tx) => {
    await setSource(tx as any, 'freeleech');
    const res = await tx.user.updateMany({ where: { id: userId, bonusPoints: { gte: price } }, data: { bonusPoints: { decrement: price } } });
    if (res.count === 0) throw new BadRequestException(`Un torrent en freeleech coûte ${price} points bonus (tu en as ${Math.floor(user.bonusPoints)}). Décoche « Torrent en freeleech » ou gagne des points en partageant.`);
    await spendDonatedFirst(tx as any, userId, price);
  });
  return price;
}

/** Rend un prix débité (l'envoi ou la modification a échoué après le paiement). */
export async function refundUploaderFreeleech(prisma: PrismaClient, userId: string, amount: number): Promise<void> {
  if (!(amount > 0)) return;
  await prisma.$transaction(async (tx) => {
    await setSource(tx as any, 'freeleech');
    await tx.user.update({ where: { id: userId }, data: { bonusPoints: { increment: amount } } });
  }).catch(() => undefined);
}
