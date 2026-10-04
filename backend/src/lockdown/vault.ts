import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from 'crypto';
import * as fs from 'fs';
import { deflateRawSync, inflateRawSync } from 'zlib';

/**
 * Coffre chiffré de l'alerte générale : un seul fichier contenant la base de données (ligne par ligne, en JSON) et les fichiers
 * du site, dans l'ordre. Chiffrement AES-256-GCM par blocs (chaque bloc authentifié : toute modification, suppression ou
 * réorganisation est détectée), clé dérivée du mot de passe avec scrypt (lent exprès : freine les essais en masse).
 *
 *   en-tête : "SDVAULT1" · sel(16) · log2(N) · r · p · vérificateur(32) · date(8)
 *   bloc    : longueur(4) · données chiffrées+étiquette ; nonce = compteur du bloc ; AAD = empreinte de l'en-tête + compteur
 */
export const MAGIC = Buffer.from('SDVAULT1');
const SCRYPT = { logN: 16, r: 8, p: 1 };
const FRAME_PLAIN_MAX = 4 * 1024 * 1024;
const HEADER_LEN = 8 + 16 + 1 + 1 + 1 + 32 + 8;

export const FRAME = {
  META: 0x05,
  TABLE_CHUNK: 0x01,
  FILE_BEGIN: 0x02,
  FILE_DATA: 0x03,
  FILE_END: 0x04,
  END: 0x7f,
} as const;

export function deriveKey(password: string, salt: Buffer, logN = SCRYPT.logN, r = SCRYPT.r, p = SCRYPT.p): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(Buffer.from(password.normalize('NFKC'), 'utf8'), salt, 32, { N: 2 ** logN, r, p, maxmem: 512 * 1024 * 1024 }, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

export const verifierOf = (key: Buffer) => createHmac('sha256', key).update('SDVAULT-VERIFY').digest();

export function newSalt() { return randomBytes(16); }

export function sameBytes(a: Buffer, b: Buffer) {
  return a.length === b.length && timingSafeEqual(a, b);
}

const nonceOf = (index: number) => {
  const iv = Buffer.alloc(12);
  iv.writeBigUInt64BE(BigInt(index), 4);
  return iv;
};
const aadOf = (headerHash: Buffer, index: number) => {
  const idx = Buffer.alloc(8);
  idx.writeBigUInt64BE(BigInt(index));
  return Buffer.concat([headerHash, idx]);
};

export class VaultWriter {
  private fh!: fs.promises.FileHandle;
  private index = 0;
  private pending: Buffer[] = [];
  private pendingLen = 0;
  private headerHash!: Buffer;
  bytes = 0;

  private constructor(private path: string, private key: Buffer) {}

  static async create(path: string, key: Buffer, salt: Buffer) {
    const w = new VaultWriter(path, key);
    w.fh = await fs.promises.open(path, 'wx', 0o600); // 'wx' : ne jamais écraser un coffre existant
    const header = Buffer.alloc(HEADER_LEN);
    let o = MAGIC.copy(header, 0);
    o += salt.copy(header, o);
    header[o++] = SCRYPT.logN; header[o++] = SCRYPT.r; header[o++] = SCRYPT.p;
    o += verifierOf(key).copy(header, o);
    header.writeBigUInt64BE(BigInt(Date.now()), o);
    w.headerHash = createHash('sha256').update(header).digest();
    await w.fh.write(header);
    w.bytes += header.length;
    return w;
  }

  /** Ajoute un enregistrement (type + contenu). Les petits enregistrements sont regroupés en blocs de 4 Mo au plus. */
  async put(type: number, body: Buffer) {
    const head = Buffer.alloc(5);
    head[0] = type;
    head.writeUInt32BE(body.length, 1);
    const rec = Buffer.concat([head, body]);
    if (this.pendingLen + rec.length > FRAME_PLAIN_MAX && this.pendingLen > 0) await this.flush();
    this.pending.push(rec);
    this.pendingLen += rec.length;
    if (this.pendingLen >= FRAME_PLAIN_MAX) await this.flush();
  }

  async flush() {
    if (this.pendingLen === 0) return;
    const plain = deflateRawSync(Buffer.concat(this.pending), { level: 1 });
    this.pending = []; this.pendingLen = 0;
    const cipher = createCipheriv('aes-256-gcm', this.key, nonceOf(this.index));
    cipher.setAAD(aadOf(this.headerHash, this.index));
    const ct = Buffer.concat([cipher.update(plain), cipher.final(), cipher.getAuthTag()]);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(ct.length);
    await this.fh.write(Buffer.concat([len, ct]));
    this.bytes += 4 + ct.length;
    this.index++;
  }

  async close() {
    await this.flush();
    await this.fh.sync();
    await this.fh.close();
  }
}

export interface VaultRecord { type: number; body: Buffer }

export class VaultReader {
  private fh!: fs.promises.FileHandle;
  private pos = HEADER_LEN;
  private index = 0;
  private headerHash!: Buffer;
  salt!: Buffer;
  verifier!: Buffer;
  private params = { logN: 0, r: 0, p: 0 };

  private constructor(private path: string) {}

  /** Lit l'en-tête : sert à dériver la clé (il faut le sel et les paramètres) puis à vérifier le mot de passe. */
  static async open(path: string) {
    const r = new VaultReader(path);
    r.fh = await fs.promises.open(path, 'r');
    const header = Buffer.alloc(HEADER_LEN);
    const { bytesRead } = await r.fh.read(header, 0, HEADER_LEN, 0);
    if (bytesRead < HEADER_LEN || !header.subarray(0, 8).equals(MAGIC)) { await r.fh.close(); throw new Error('Fichier de coffre invalide'); }
    r.salt = Buffer.from(header.subarray(8, 24));
    r.params = { logN: header[24], r: header[25], p: header[26] };
    r.verifier = Buffer.from(header.subarray(27, 59));
    r.headerHash = createHash('sha256').update(header).digest();
    return r;
  }

  deriveKey(password: string) { return deriveKey(password, this.salt, this.params.logN, this.params.r, this.params.p); }

  /** Enregistrements dans l'ordre. Toute altération du fichier fait échouer le déchiffrement (étiquette GCM). */
  async *records(key: Buffer): AsyncGenerator<VaultRecord> {
    const size = (await this.fh.stat()).size;
    const lenBuf = Buffer.alloc(4);
    while (this.pos < size) {
      if ((await this.fh.read(lenBuf, 0, 4, this.pos)).bytesRead < 4) throw new Error('Coffre tronqué');
      const len = lenBuf.readUInt32BE(0);
      if (len < 16 || this.pos + 4 + len > size) throw new Error('Coffre tronqué ou corrompu');
      const ct = Buffer.alloc(len);
      await this.fh.read(ct, 0, len, this.pos + 4);
      this.pos += 4 + len;
      const decipher = createDecipheriv('aes-256-gcm', key, nonceOf(this.index));
      decipher.setAAD(aadOf(this.headerHash, this.index));
      decipher.setAuthTag(ct.subarray(len - 16));
      let plain: Buffer;
      try {
        plain = inflateRawSync(Buffer.concat([decipher.update(ct.subarray(0, len - 16)), decipher.final()]));
      } catch {
        throw new Error('Coffre corrompu ou modifié (bloc illisible)');
      }
      this.index++;
      let o = 0;
      while (o < plain.length) {
        const type = plain[o];
        const blen = plain.readUInt32BE(o + 1);
        yield { type, body: plain.subarray(o + 5, o + 5 + blen) };
        o += 5 + blen;
      }
    }
  }

  async close() { await this.fh.close(); }
}
