import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Writable } from 'stream';
import { crc32, planZip, writePlan } from './zip-writer';

const python = (() => { for (const c of ['python', 'python3']) { const r = spawnSync(c, ['--version']); if (r.status === 0) return c; } return null; })();
const itPy = python ? it : it.skip;

class Sink extends Writable {
  chunks: Buffer[] = [];
  _write(chunk: Buffer, _enc: string, cb: () => void) { this.chunks.push(Buffer.from(chunk)); cb(); }
}

async function build(entries: Parameters<typeof planZip>[0], opts?: Parameters<typeof planZip>[1]) {
  const plan = await planZip(entries, opts);
  const sink = new Sink();
  await writePlan(plan, sink);
  return { plan, bytes: Buffer.concat(sink.chunks) };
}

function pyCheck(file: string) {
  const code = `
import zipfile, json, sys
z = zipfile.ZipFile(sys.argv[1])
bad = z.testzip()
print(json.dumps({'bad': bad, 'names': z.namelist(), 'data': {n: z.read(n).decode('utf8', 'replace')[:40] for n in z.namelist()}}))
`;
  const r = spawnSync(python!, ['-c', code, file], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr);
  return JSON.parse(r.stdout);
}

describe('crc32', () => {
  it('valeur connue', () => { expect(crc32(Buffer.from('123456789'))).toBe(0xcbf43926); });
});

describe('écrivain de ZIP', () => {
  let tmp: string;
  beforeAll(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zipw-')); });
  afterAll(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

  it('la taille annoncée est exacte', async () => {
    const f = path.join(tmp, 'a.bin'); fs.writeFileSync(f, Buffer.alloc(3_000_000, 7));
    const { plan, bytes } = await build([{ name: 'a/LISEZ-MOI.txt', data: Buffer.from('bonjour') }, { name: 'a/gros.bin', data: { file: f } }]);
    expect(bytes.length).toBe(plan.totalSize);
  });

  itPy('s\'ouvre et se vérifie avec un vrai lecteur de ZIP (noms accentués, fichier et texte)', async () => {
    const f = path.join(tmp, 'b.bin'); fs.writeFileSync(f, 'contenu du paquet '.repeat(1000));
    const { bytes } = await build([{ name: 'dossier/Mode d\'emploi é.txt', data: Buffer.from('Étape 1 : installer Docker') }, { name: 'dossier/paquet.tar.enc', data: { file: f } }]);
    const out = path.join(tmp, 'b.zip'); fs.writeFileSync(out, bytes);
    const r = pyCheck(out);
    expect(r.bad).toBeNull();
    expect(r.names).toEqual(['dossier/Mode d\'emploi é.txt', 'dossier/paquet.tar.enc']);
    expect(r.data['dossier/Mode d\'emploi é.txt']).toBe('Étape 1 : installer Docker');
    expect(r.data['dossier/paquet.tar.enc'].startsWith('contenu du paquet')).toBe(true);
  });

  itPy('ZIP64 (gros fichiers) lisible aussi', async () => {
    const { bytes } = await build([{ name: 'x.txt', data: Buffer.from('petit mais en zip64') }, { name: 'y.txt', data: Buffer.from('deuxième') }], { forceZip64: true });
    const out = path.join(tmp, 'c.zip'); fs.writeFileSync(out, bytes);
    const r = pyCheck(out);
    expect(r.bad).toBeNull();
    expect(r.names).toEqual(['x.txt', 'y.txt']);
    expect(r.data['x.txt']).toBe('petit mais en zip64');
  });

  it('une empreinte déjà connue évite de relire le fichier', async () => {
    const f = path.join(tmp, 'd.bin'); fs.writeFileSync(f, 'abc');
    const plan = await planZip([{ name: 'd.bin', data: { file: f } }], { known: { [f]: { crc: crc32(Buffer.from('abc')), size: 3 } } });
    expect(plan.totalSize).toBeGreaterThan(3);
  });
});
