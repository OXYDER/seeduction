import { ECONOMY } from './economy';
import { freeleechPrice } from './freeleech-cost';

describe('freeleechPrice', () => {
  const saved = ECONOMY.uploadFreeleechCost;
  afterEach(() => { ECONOMY.uploadFreeleechCost = saved; });

  it('fait payer les membres et les uploaders, jamais le personnel', () => {
    ECONOMY.uploadFreeleechCost = 100;
    expect(freeleechPrice('USER')).toBe(100);
    expect(freeleechPrice('UPLOADER')).toBe(100);
    for (const r of ['MODERATOR', 'SUPER_MODERATOR', 'ADMIN', 'OWNER']) expect(freeleechPrice(r)).toBe(0);
  });

  it('un prix à 0 rend le freeleech gratuit, un prix invalide ne devient jamais négatif', () => {
    ECONOMY.uploadFreeleechCost = 0;
    expect(freeleechPrice('USER')).toBe(0);
    ECONOMY.uploadFreeleechCost = -5;
    expect(freeleechPrice('USER')).toBe(0);
    ECONOMY.uploadFreeleechCost = 99.9;
    expect(freeleechPrice('USER')).toBe(99);
  });
});
