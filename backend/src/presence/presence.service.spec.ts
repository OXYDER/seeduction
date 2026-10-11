import { PresenceService } from './presence.service';

const prisma = (pref: string) => ({ user: { findUnique: async () => ({ presenceStatus: pref }) } }) as any;

async function setup(pref = 'ONLINE') {
  const svc = new PresenceService(prisma(pref));
  const events: any[] = [];
  svc.on('status-changed', (e) => events.push(e));
  await svc.connect('u1', 's1', 'alice');
  svc.watch('u1', 's1');
  return { svc, events };
}

describe('PresenceService : inactivité', () => {
  it('passe « Absent » quand l\'onglet est inactif, puis « En ligne » à son retour', async () => {
    const { svc, events } = await setup();
    expect(svc.publicStatus('u1')).toBe('ONLINE');
    svc.setIdle('u1', 's1', true);
    expect(svc.publicStatus('u1')).toBe('AWAY');
    expect(svc.listOnline()[0].status).toBe('AWAY');
    svc.setIdle('u1', 's1', false);
    expect(svc.publicStatus('u1')).toBe('ONLINE');
    expect(events.map((e) => e.status)).toEqual(['AWAY', 'ONLINE']);
  });

  it('reste « En ligne » tant qu\'un autre onglet est actif', async () => {
    const { svc, events } = await setup();
    await svc.connect('u1', 's2', 'alice');
    svc.watch('u1', 's2');
    svc.setIdle('u1', 's1', true);
    expect(svc.publicStatus('u1')).toBe('ONLINE');
    svc.setIdle('u1', 's2', true);
    expect(svc.publicStatus('u1')).toBe('AWAY');
    svc.setIdle('u1', 's2', false);
    expect(svc.publicStatus('u1')).toBe('ONLINE');
    expect(events.map((e) => e.status)).toEqual(['AWAY', 'ONLINE']);
  });

  it('revient « En ligne » si l\'onglet actif se ferme alors que l\'autre est inactif… et inversement', async () => {
    const { svc } = await setup();
    await svc.connect('u1', 's2', 'alice');
    svc.watch('u1', 's2');
    svc.setIdle('u1', 's1', true);
    svc.disconnect('u1', 's2'); // il ne reste que l'onglet inactif
    expect(svc.publicStatus('u1')).toBe('AWAY');
  });

  it('ne change jamais « Occupé » ni « Apparaître hors ligne »', async () => {
    const busy = await setup('BUSY');
    busy.svc.setIdle('u1', 's1', true);
    expect(busy.svc.publicStatus('u1')).toBe('BUSY');
    const hidden = await setup('INVISIBLE');
    hidden.svc.setIdle('u1', 's1', true);
    expect(hidden.svc.publicStatus('u1')).toBe('OFFLINE');
  });

  it('ignore un signal venant d\'un onglet inconnu', async () => {
    const { svc } = await setup();
    svc.setIdle('u1', 'inconnu', true);
    expect(svc.publicStatus('u1')).toBe('ONLINE');
  });
});
