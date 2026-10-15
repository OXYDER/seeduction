import { activeEvent, defaultEventConfig, easterDate, localDate, nextNewYear, nextWindow, normalizeEventConfig } from './event-themes';

const at = (iso: string) => new Date(iso);
const cfg = () => defaultEventConfig();

describe('Pâques', () => {
  it('dates connues du dimanche de Pâques', () => {
    expect(easterDate(2024)).toEqual({ m: 3, d: 31 });
    expect(easterDate(2025)).toEqual({ m: 4, d: 20 });
    expect(easterDate(2026)).toEqual({ m: 4, d: 5 });
    expect(easterDate(2027)).toEqual({ m: 3, d: 28 });
    expect(easterDate(2038)).toEqual({ m: 4, d: 25 });
  });
});

describe('thème actif selon la date', () => {
  it('rien en dehors des périodes', () => {
    expect(activeEvent(at('2026-09-10T16:00:00Z'), cfg())).toBeNull();
    expect(activeEvent(at('2026-08-01T16:00:00Z'), cfg())).toBeNull();
  });
  it('périodes fixes (bornes incluses)', () => {
    expect(activeEvent(at('2026-10-14T16:00:00Z'), cfg())).toBeNull();
    expect(activeEvent(at('2026-10-15T16:00:00Z'), cfg())?.id).toBe('halloween');
    expect(activeEvent(at('2026-11-01T16:00:00Z'), cfg())?.id).toBe('halloween');
    expect(activeEvent(at('2026-11-02T16:00:00Z'), cfg())).toBeNull();
    expect(activeEvent(at('2026-12-25T16:00:00Z'), cfg())?.id).toBe('noel');
    expect(activeEvent(at('2027-02-14T16:00:00Z'), cfg())?.id).toBe('valentin');
    expect(activeEvent(at('2026-06-24T16:00:00Z'), cfg())?.id).toBe('saintjean');
    expect(activeEvent(at('2026-07-01T16:00:00Z'), cfg())?.id).toBe('canada');
  });
  it('Pâques suit la date de l\'année : 7 jours avant jusqu\'au lundi', () => {
    expect(activeEvent(at('2026-03-28T16:00:00Z'), cfg())).toBeNull();
    expect(activeEvent(at('2026-03-29T16:00:00Z'), cfg())?.id).toBe('paques');
    expect(activeEvent(at('2026-04-06T16:00:00Z'), cfg())?.id).toBe('paques');
    expect(activeEvent(at('2026-04-07T16:00:00Z'), cfg())).toBeNull();
    expect(activeEvent(at('2027-03-21T16:00:00Z'), cfg())?.id).toBe('paques');
  });
  it('période à cheval sur le Nouvel An', () => {
    const c = cfg(); c.events.noel = { ...c.events.noel, from: '12-20', to: '01-03' };
    expect(activeEvent(at('2026-12-30T16:00:00Z'), c)?.id).toBe('noel');
    expect(activeEvent(at('2027-01-02T16:00:00Z'), c)?.id).toBe('noel');
    expect(activeEvent(at('2027-01-04T16:00:00Z'), c)).toBeNull();
  });
  it('le fuseau compte : minuit à Montréal n\'est pas minuit à Londres', () => {
    // 2026-10-15 03:00 UTC = 14 octobre 23:00 à Montréal (heure d'été)
    expect(activeEvent(at('2026-10-15T03:00:00Z'), cfg())).toBeNull();
    expect(activeEvent(at('2026-10-15T04:30:00Z'), cfg())?.id).toBe('halloween');
    expect(localDate(at('2026-10-15T03:00:00Z'), 'America/Toronto')).toEqual({ y: 2026, m: 10, d: 14 });
  });
  it('un événement désactivé n\'est jamais choisi, l\'interrupteur général coupe tout', () => {
    const c = cfg(); c.events.halloween.enabled = false;
    expect(activeEvent(at('2026-10-20T16:00:00Z'), c)).toBeNull();
    const d = cfg(); d.enabled = false;
    expect(activeEvent(at('2026-12-10T16:00:00Z'), d)).toBeNull();
  });
  it('chevauchement : le premier de la liste gagne', () => {
    const c = cfg(); c.events.noel = { ...c.events.noel, from: '02-10', to: '02-20' };
    expect(activeEvent(at('2027-02-12T16:00:00Z'), c)?.id).toBe('valentin');
  });
});

describe('Jour de l\'An', () => {
  it('du 28 décembre au 3 janvier, à cheval sur le changement d\'année', () => {
    expect(activeEvent(at('2026-12-27T16:00:00Z'), cfg())?.id).toBe('noel');
    expect(activeEvent(at('2026-12-28T16:00:00Z'), cfg())?.id).toBe('nouvelan');
    expect(activeEvent(at('2026-12-31T23:00:00Z'), cfg())?.id).toBe('nouvelan');
    expect(activeEvent(at('2027-01-01T16:00:00Z'), cfg())?.id).toBe('nouvelan');
    expect(activeEvent(at('2027-01-03T16:00:00Z'), cfg())?.id).toBe('nouvelan');
    expect(activeEvent(at('2027-01-04T16:00:00Z'), cfg())).toBeNull();
  });
  it('une ancienne configuration sans cet événement le reçoit avec ses valeurs par défaut', () => {
    const old: any = defaultEventConfig(); delete old.events.nouvelan;
    expect(normalizeEventConfig(old).events.nouvelan).toMatchObject({ enabled: true, from: '12-28', to: '01-03' });
  });
});

describe('forçage manuel', () => {
  it('l\'emporte sur le calendrier, même hors période', () => {
    const c = cfg(); c.force = { id: 'noel', until: null };
    expect(activeEvent(at('2026-07-10T16:00:00Z'), c)).toEqual({ id: 'noel', source: 'forced', until: null });
  });
  it('expire à l\'heure dite', () => {
    const c = cfg(); c.force = { id: 'halloween', until: '2026-07-10T20:00:00Z' };
    expect(activeEvent(at('2026-07-10T19:00:00Z'), c)?.source).toBe('forced');
    expect(activeEvent(at('2026-07-10T21:00:00Z'), c)).toBeNull();
    expect(activeEvent(at('2026-12-10T21:00:00Z'), c)?.source).toBe('schedule');
  });
  it('l\'interrupteur général coupe aussi un forçage', () => {
    const c = cfg(); c.force = { id: 'noel', until: null }; c.enabled = false;
    expect(activeEvent(at('2026-07-10T16:00:00Z'), c)).toBeNull();
  });
});

describe('prochaine période', () => {
  it('en cours, puis à venir (année suivante si besoin)', () => {
    expect(nextWindow('halloween', at('2026-10-20T16:00:00Z'), cfg())).toEqual({ start: '2026-10-15', end: '2026-11-01', running: true });
    expect(nextWindow('halloween', at('2026-11-05T16:00:00Z'), cfg())).toEqual({ start: '2027-10-15', end: '2027-11-01', running: false });
    expect(nextWindow('paques', at('2026-01-10T16:00:00Z'), cfg())).toEqual({ start: '2026-03-29', end: '2026-04-06', running: false });
  });
});

describe('configuration', () => {
  it('valeurs par défaut et nettoyage', () => {
    expect(normalizeEventConfig(null)).toEqual(defaultEventConfig());
    const c = normalizeEventConfig({ particles: false, timezone: 'Mars/Phobos', events: { halloween: { from: '13-40', to: '10-31', enabled: false }, noel: { from: '12-02', to: '12-30' } }, force: { id: 'inconnu', until: 'x' } });
    expect(c.particles).toBe(false);
    expect(c.timezone).toBe('America/Toronto');
    expect(c.events.halloween).toMatchObject({ from: '10-15', to: '10-31', enabled: false });
    expect(c.events.noel).toMatchObject({ from: '12-02', to: '12-30' });
    expect(c.force).toEqual({ id: null, until: null });
  });
  it('29 février accepté, 30 février refusé', () => {
    expect(normalizeEventConfig({ events: { valentin: { from: '02-29', to: '02-30' } } }).events.valentin).toMatchObject({ from: '02-29', to: '02-15' });
  });
});

describe('valeurs invalides à l\'enregistrement', () => {
  it('on garde ce qui était déjà enregistré', () => {
    const prev = defaultEventConfig(); prev.events.halloween = { ...prev.events.halloween, from: '10-01' };
    const c = normalizeEventConfig({ ...prev, events: { ...prev.events, halloween: { ...prev.events.halloween, from: '99-99' } } }, prev);
    expect(c.events.halloween.from).toBe('10-01');
  });
});

describe('compte à rebours du Jour de l\'An', () => {
  it('minuit pile dans le fuseau choisi (heure d\'hiver : UTC-5 à Montréal)', () => {
    expect(nextNewYear(at('2026-10-14T16:00:00Z'), 'America/Toronto')).toEqual({ at: new Date('2027-01-01T05:00:00Z'), year: 2027 });
    expect(nextNewYear(at('2026-12-31T23:30:00Z'), 'America/Toronto').year).toBe(2027);
  });
  it('autres fuseaux', () => {
    expect(nextNewYear(at('2026-06-01T00:00:00Z'), 'UTC').at.toISOString()).toBe('2027-01-01T00:00:00.000Z');
    expect(nextNewYear(at('2026-06-01T00:00:00Z'), 'Europe/Paris').at.toISOString()).toBe('2026-12-31T23:00:00.000Z');
    expect(nextNewYear(at('2026-06-01T00:00:00Z'), 'Pacific/Kiritimati').at.toISOString()).toBe('2026-12-31T10:00:00.000Z');
  });
  it('après minuit, le suivant est dans un an', () => {
    expect(nextNewYear(at('2027-01-01T05:00:01Z'), 'America/Toronto')).toEqual({ at: new Date('2028-01-01T05:00:00Z'), year: 2028 });
  });
  it('réglages : activé, 30 jours par défaut, bornes', () => {
    expect(defaultEventConfig().countdown).toEqual({ enabled: true, daysBefore: 30 });
    expect(normalizeEventConfig({ countdown: { enabled: false, daysBefore: 9999 } }).countdown).toEqual({ enabled: false, daysBefore: 120 });
  });
});
