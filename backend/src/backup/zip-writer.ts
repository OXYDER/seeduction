// Écrivain de fichiers ZIP en flux, sans dépendance : les entrées sont « stockées » (sans compression : un paquet de sauvegarde est déjà chiffré, donc
// incompressible), les gros fichiers (> 4 Go) passent en ZIP64. Le calcul de la taille est fait d'avance, pour annoncer un Content-Length exact.

import * as fs from 'fs';
import { Writable } from 'stream';

export interface ZipInput { name: string; data: Buffer | { file: string }; mtime?: Date; /** Droits Unix (ex. 0o100755 pour un script exécutable). */ mode?: number }

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();

export function crc32Update(crc: number, buf: Buffer): number {
  let c = crc ^ 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
export const crc32 = (buf: Buffer) => crc32Update(0, buf);

export function crc32File(file: string): Promise<{ crc: number; size: number }> {
  return new Promise((resolve, reject) => {
    let crc = 0, size = 0;
    fs.createReadStream(file, { highWaterMark: 1 << 20 }).on('data', (c: string | Buffer) => { const b = c as Buffer; crc = crc32Update(crc, b); size += b.length; }).on('end', () => resolve({ crc, size })).on('error', reject);
  });
}

function dosDateTime(d: Date) {
  const year = Math.max(1980, d.getFullYear());
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

type Part = Buffer | { file: string; size: number };
export interface ZipPlan { parts: Part[]; totalSize: number }

const U32 = 0xffffffff;
const U16 = 0xffff;

/**
 * Prépare le ZIP : calcule l'empreinte (CRC-32) de chaque entrée puis la suite exacte des morceaux à écrire. `forceZip64` sert aux tests (ZIP64 sans fichier de 4 Go).
 * `known` permet de fournir une empreinte déjà calculée pour un fichier (évite de relire un gros paquet).
 */
export async function planZip(inputs: ZipInput[], opts: { forceZip64?: boolean; known?: Record<string, { crc: number; size: number }> } = {}): Promise<ZipPlan> {
  const parts: Part[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  const push = (p: Part) => { parts.push(p); offset += Buffer.isBuffer(p) ? p.length : p.size; };

  for (const e of inputs) {
    const name = Buffer.from(e.name, 'utf8');
    let crc: number, size: number;
    if (Buffer.isBuffer(e.data)) { crc = crc32(e.data); size = e.data.length; }
    else { const k = opts.known?.[e.data.file]; ({ crc, size } = k ?? (await crc32File(e.data.file))); }
    const { time, date } = dosDateTime(e.mtime ?? new Date());
    const zip64 = !!opts.forceZip64 || size >= U32 || offset >= U32;

    // En-tête local
    const extra = zip64 ? Buffer.alloc(20) : Buffer.alloc(0);
    if (zip64) { extra.writeUInt16LE(0x0001, 0); extra.writeUInt16LE(16, 2); extra.writeBigUInt64LE(BigInt(size), 4); extra.writeBigUInt64LE(BigInt(size), 12); }
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(zip64 ? 45 : 20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(0, 8);
    lh.writeUInt16LE(time, 10); lh.writeUInt16LE(date, 12); lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(zip64 ? U32 : size, 18); lh.writeUInt32LE(zip64 ? U32 : size, 22); lh.writeUInt16LE(name.length, 26); lh.writeUInt16LE(extra.length, 28);
    const localOffset = offset;
    push(Buffer.concat([lh, name, extra]));
    push(Buffer.isBuffer(e.data) ? e.data : { file: e.data.file, size });

    // Entrée du répertoire central
    const needOffset64 = localOffset >= U32 || !!opts.forceZip64;
    const cExtraLen = zip64 || needOffset64 ? 4 + (zip64 ? 16 : 0) + (needOffset64 ? 8 : 0) : 0;
    const cExtra = Buffer.alloc(cExtraLen);
    if (cExtraLen) {
      cExtra.writeUInt16LE(0x0001, 0); cExtra.writeUInt16LE(cExtraLen - 4, 2);
      let o = 4;
      if (zip64) { cExtra.writeBigUInt64LE(BigInt(size), o); cExtra.writeBigUInt64LE(BigInt(size), o + 8); o += 16; }
      if (needOffset64) cExtra.writeBigUInt64LE(BigInt(localOffset), o);
    }
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(zip64 || needOffset64 ? 45 : 20, 4); ch.writeUInt16LE(zip64 || needOffset64 ? 45 : 20, 6);
    ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(0, 10); ch.writeUInt16LE(time, 12); ch.writeUInt16LE(date, 14); ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(zip64 ? U32 : size, 20); ch.writeUInt32LE(zip64 ? U32 : size, 24); ch.writeUInt16LE(name.length, 28); ch.writeUInt16LE(cExtraLen, 30);
    ch.writeUInt16LE(0, 32); ch.writeUInt16LE(0, 34); ch.writeUInt16LE(0, 36); ch.writeUInt32LE((((e.mode ?? 0o100644) << 16) >>> 0), 38);
    ch.writeUInt32LE(needOffset64 ? U32 : localOffset, 42);
    central.push(Buffer.concat([ch, name, cExtra]));
  }

  const cdOffset = offset;
  const cd = Buffer.concat(central);
  push(cd);
  const entries = inputs.length;
  const needZip64End = !!opts.forceZip64 || cdOffset >= U32 || cd.length >= U32 || entries >= U16;
  if (needZip64End) {
    const z = Buffer.alloc(56);
    z.writeUInt32LE(0x06064b50, 0); z.writeBigUInt64LE(44n, 4); z.writeUInt16LE(45, 12); z.writeUInt16LE(45, 14); z.writeUInt32LE(0, 16); z.writeUInt32LE(0, 20);
    z.writeBigUInt64LE(BigInt(entries), 24); z.writeBigUInt64LE(BigInt(entries), 32); z.writeBigUInt64LE(BigInt(cd.length), 40); z.writeBigUInt64LE(BigInt(cdOffset), 48);
    const loc = Buffer.alloc(20);
    loc.writeUInt32LE(0x07064b50, 0); loc.writeUInt32LE(0, 4); loc.writeBigUInt64LE(BigInt(offset), 8); loc.writeUInt32LE(1, 16);
    push(z); push(loc);
  }
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(0, 4); end.writeUInt16LE(0, 6);
  end.writeUInt16LE(needZip64End ? U16 : entries, 8); end.writeUInt16LE(needZip64End ? U16 : entries, 10);
  end.writeUInt32LE(needZip64End ? U32 : cd.length, 12); end.writeUInt32LE(needZip64End ? U32 : cdOffset, 16); end.writeUInt16LE(0, 20);
  push(end);
  return { parts, totalSize: offset };
}

/** Écrit le plan dans un flux (avec la contre-pression : un gros paquet n'est jamais chargé en mémoire). */
export async function writePlan(plan: ZipPlan, out: Writable): Promise<void> {
  const write = (chunk: Buffer) => new Promise<void>((resolve, reject) => { if (out.write(chunk)) resolve(); else { out.once('drain', resolve); out.once('error', reject); } });
  for (const p of plan.parts) {
    if (Buffer.isBuffer(p)) { await write(p); continue; }
    await new Promise<void>((resolve, reject) => {
      const rs = fs.createReadStream(p.file, { highWaterMark: 1 << 20 });
      rs.on('data', (c: string | Buffer) => { if (!out.write(c as Buffer)) { rs.pause(); out.once('drain', () => rs.resume()); } });
      rs.on('end', resolve);
      rs.on('error', reject);
      out.once('error', reject);
    });
  }
  await new Promise<void>((resolve) => out.end(resolve));
}
