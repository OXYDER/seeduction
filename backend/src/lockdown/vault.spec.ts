import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { deriveKey, FRAME, newSalt, sameBytes, VaultReader, VaultWriter, verifierOf } from './vault';

describe('coffre chiffré (alerte générale)', () => {
  let dir: string;
  beforeAll(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-')); });
  afterAll(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  async function write(file: string, password: string, records: Array<[number, Buffer]>) {
    const salt = newSalt();
    const key = await deriveKey(password, salt);
    const w = await VaultWriter.create(file, key, salt);
    for (const [t, b] of records) await w.put(t, b);
    await w.close();
    return key;
  }
  async function readAll(file: string, key: Buffer) {
    const r = await VaultReader.open(file);
    const out: Array<[number, Buffer]> = [];
    try { for await (const rec of r.records(key)) out.push([rec.type, Buffer.from(rec.body)]); } finally { await r.close(); }
    return out;
  }

  it('relit exactement ce qui a été écrit (petits et gros enregistrements, plusieurs blocs)', async () => {
    const file = path.join(dir, 'a.sdv');
    const big = Buffer.alloc(9 * 1024 * 1024, 7); // dépasse la taille d'un bloc : force plusieurs blocs
    const recs: Array<[number, Buffer]> = [[FRAME.META, Buffer.from('{"x":1}')], [FRAME.TABLE_CHUNK, Buffer.from('éàü « accents »')], [FRAME.FILE_DATA, big], [FRAME.END, Buffer.from('{}')]];
    const key = await write(file, 'un-bon-mot-de-passe', recs);
    const back = await readAll(file, key);
    expect(back.length).toBe(recs.length);
    back.forEach(([t, b], i) => { expect(t).toBe(recs[i][0]); expect(b.equals(recs[i][1])).toBe(true); });
  });

  it('ne contient rien de lisible dans le fichier', async () => {
    const file = path.join(dir, 'b.sdv');
    await write(file, 'un-bon-mot-de-passe', [[FRAME.TABLE_CHUNK, Buffer.from('SECRET-LISIBLE-12345')]]);
    expect(fs.readFileSync(file).includes(Buffer.from('SECRET-LISIBLE'))).toBe(false);
  });

  it('refuse un mauvais mot de passe (vérificateur différent, déchiffrement impossible)', async () => {
    const file = path.join(dir, 'c.sdv');
    const key = await write(file, 'le-bon-mot-de-passe', [[FRAME.META, Buffer.from('x')]]);
    const r = await VaultReader.open(file);
    const bad = await r.deriveKey('le-mauvais-mot-de-passe');
    expect(sameBytes(verifierOf(bad), r.verifier)).toBe(false);
    expect(sameBytes(verifierOf(key), r.verifier)).toBe(true);
    await expect((async () => { for await (const _ of r.records(bad)) { /* rien */ } })()).rejects.toThrow();
    await r.close();
  });

  it('détecte un octet modifié, un fichier tronqué et un en-tête altéré', async () => {
    const file = path.join(dir, 'd.sdv');
    const key = await write(file, 'un-bon-mot-de-passe', [[FRAME.META, Buffer.from('a'.repeat(5000))], [FRAME.END, Buffer.from('{}')]]);
    const orig = fs.readFileSync(file);

    const flipped = Buffer.from(orig); flipped[orig.length - 40] ^= 0x01;
    fs.writeFileSync(file, flipped);
    await expect(readAll(file, key)).rejects.toThrow();

    fs.writeFileSync(file, orig.subarray(0, orig.length - 10));
    await expect(readAll(file, key)).rejects.toThrow();

    const hdr = Buffer.from(orig); hdr[30] ^= 0x01; // paramètres de l'en-tête : il est authentifié dans chaque bloc
    fs.writeFileSync(file, hdr);
    await expect(readAll(file, key)).rejects.toThrow();
  });

  it('refuse d\'écraser un coffre existant', async () => {
    const file = path.join(dir, 'e.sdv');
    await write(file, 'un-bon-mot-de-passe', [[FRAME.META, Buffer.from('x')]]);
    await expect(write(file, 'autre-mot-de-passe-12', [[FRAME.META, Buffer.from('y')]])).rejects.toThrow();
  });
});
