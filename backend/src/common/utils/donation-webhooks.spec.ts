import { createHmac } from 'crypto';
import { bmcDonation, candidateNames, kofiDonation, maskEmail, parseKofi, pseudoInMessage, verifyBmcSignature } from './donation-webhooks';

const members = new Set(['alice', 'bob', 'merci', 'jean-luc']);
const exists = (n: string) => members.has(n.toLowerCase());

describe('Ko-fi', () => {
  const data = { verification_token: 'tok', message_id: 'm1', kofi_transaction_id: 't1', type: 'Donation', amount: '5.00', currency: 'CAD', from_name: 'Marc', message: 'pseudo: Alice', email: 'marc@x.com', timestamp: '2026-10-01T12:00:00Z' };
  it('lit le formulaire (champ data en texte JSON) et le jeton', () => {
    const r = parseKofi({ data: JSON.stringify(data) });
    expect(r.token).toBe('tok');
    expect(kofiDonation(r.payload)).toMatchObject({ provider: 'kofi', externalId: 't1', kind: 'donation', amount: 5, currency: 'CAD', payerName: 'Marc' });
  });
  it('accepte aussi du JSON déjà décodé, refuse le reste', () => {
    expect(parseKofi({ data }).token).toBe('tok');
    expect(parseKofi({ data: '{pas du json' }).payload).toBeNull();
    expect(parseKofi(null).payload).toBeNull();
  });
  it('distingue dons, abonnements et le reste (boutique, commandes)', () => {
    expect(kofiDonation({ ...data, type: 'Subscription' })?.kind).toBe('subscription');
    expect(kofiDonation({ ...data, type: 'Shop Order' })?.kind).toBe('other');
  });
  it('sans identifiant, rien n\'est crédité', () => { expect(kofiDonation({ type: 'Donation', amount: '5' })).toBeNull(); });
});

describe('Buy Me a Coffee', () => {
  const body = { type: 'donation.created', data: { id: 77, amount: 10, currency: 'CAD', supporter_name: 'Ann', supporter_email: 'ann@x.com', supporter_message: '@bob', refunded: false } };
  it('vérifie la signature du corps exact', () => {
    const raw = Buffer.from(JSON.stringify(body));
    const sig = createHmac('sha256', 'secret').update(raw).digest('hex');
    expect(verifyBmcSignature(raw, sig, 'secret')).toBe(true);
    expect(verifyBmcSignature(raw, 'sha256=' + sig, 'secret')).toBe(true);
    expect(verifyBmcSignature(raw, sig, 'autre')).toBe(false);
    expect(verifyBmcSignature(Buffer.from('{}'), sig, 'secret')).toBe(false);
    expect(verifyBmcSignature(raw, undefined, 'secret')).toBe(false);
    expect(verifyBmcSignature(raw, sig, '')).toBe(false);
  });
  it('lit un don, un abonnement, et le format « response »', () => {
    expect(bmcDonation(body)).toMatchObject({ provider: 'bmc', externalId: '77', kind: 'donation', amount: 10, currency: 'CAD', message: '@bob' });
    expect(bmcDonation({ type: 'membership.started', response: { id: 'a', amount: '5', currency: 'cad' } })).toMatchObject({ kind: 'subscription', amount: 5, currency: 'CAD' });
    expect(bmcDonation({ type: 'extra_purchase.created', data: { id: 1 } })?.kind).toBe('other');
  });
  it('repère un remboursement', () => {
    expect(bmcDonation({ type: 'donation.refunded', data: { id: 1, amount: 5 } })?.refunded).toBe(true);
    expect(bmcDonation({ type: 'donation.created', data: { id: 1, refunded: true } })?.refunded).toBe(true);
  });
});

describe('reconnaissance du pseudo', () => {
  it('« pseudo : x », « @x » et un message qui ne contient que le pseudo sont certains', () => {
    expect(pseudoInMessage('Pseudo: Alice, merci pour le site', exists)).toEqual({ username: 'Alice', certain: true });
    expect(pseudoInMessage('Bravo ! @bob', exists)).toEqual({ username: 'bob', certain: true });
    expect(pseudoInMessage('  Jean-Luc  ', exists)).toEqual({ username: 'Jean-Luc', certain: true });
  });
  it('un pseudo noyé dans une phrase est seulement probable (pas de crédit automatique)', () => {
    expect(pseudoInMessage('Merci pour tout le travail', exists)).toEqual({ username: 'Merci', certain: false });
    expect(pseudoInMessage('de la part de alice', exists)).toEqual({ username: 'alice', certain: false });
  });
  it('plusieurs pseudos différents, ou aucun : rien', () => {
    expect(pseudoInMessage('alice et bob', exists).username).toBeNull();
    expect(pseudoInMessage('@alice @bob', exists).certain).toBe(false);
    expect(pseudoInMessage('bonne continuation', exists).username).toBeNull();
    expect(pseudoInMessage('', exists).username).toBeNull();
  });
  it('liste les mots à chercher dans la base', () => {
    expect(candidateNames('Pseudo: Alice, @Bob !')).toEqual(expect.arrayContaining(['alice', 'bob', 'pseudo']));
  });
});

it('masque le courriel', () => { expect(maskEmail('marc@gmail.com')).toBe('ma***@gmail.com'); expect(maskEmail('invalide')).toBe(''); });
