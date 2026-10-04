import { BadRequestException, ForbiddenException, HttpException, HttpStatus, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../common/prisma.service';
import { AuthService } from '../auth/auth.service';
import { AuditService } from '../audit/audit.service';
import { MailService } from '../mail/mail.service';
import { lockState, lockdownDir } from './lockdown-state';
import { deriveKey, FRAME, newSalt, sameBytes, VaultReader, VaultWriter, verifierOf } from './vault';

const q = (name: string) => `"${name.replace(/"/g, '""')}"`;
const CHUNK_ROWS = 500;
const FILE_CHUNK = 1024 * 1024;
const MIN_LOCK_PASSWORD = 12;

/** Dossiers de fichiers du site (torrents, pochettes, pièces jointes du chat, sauvegardes) : chiffrés dans le coffre puis effacés. */
function fileRoots(): { key: string; dir: string }[] {
  const roots = [
    { key: 'torrents', dir: process.env.TORRENT_STORAGE_DIR ?? './storage/torrents' },
    { key: 'covers', dir: process.env.COVER_STORAGE_DIR ?? './storage/covers' },
    { key: 'chat-files', dir: process.env.CHAT_FILE_STORAGE_DIR ?? './storage/chat-files' },
  ];
  if (process.env.BACKUPS_DIR) roots.push({ key: 'backups', dir: process.env.BACKUPS_DIR });
  return roots.map((r) => ({ key: r.key, dir: path.resolve(r.dir) })).filter((r) => fs.existsSync(r.dir));
}

async function* walk(dir: string, rel = ''): AsyncGenerator<{ rel: string; abs: string; size: number; mtimeMs: number }> {
  let entries: fs.Dirent[];
  try { entries = await fs.promises.readdir(path.join(dir, rel), { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) yield* walk(dir, r);
    else if (e.isFile()) { // les liens symboliques (ex. « dernière sauvegarde ») ne sont ni copiés ni suivis
      const abs = path.join(dir, r);
      const st = await fs.promises.stat(abs);
      yield { rel: r, abs, size: st.size, mtimeMs: st.mtimeMs };
    }
  }
}

/** Limiteur simple des essais de mot de passe (par adresse IP et global) : le déblocage est public, il doit résister à la force brute. */
class Tries {
  private byKey = new Map<string, { n: number; at: number }>();
  check(key: string, limit: number, windowMs: number) {
    const e = this.byKey.get(key);
    if (e && Date.now() - e.at < windowMs && e.n >= limit) {
      throw new HttpException(`Trop d'essais. Réessaie dans ${Math.ceil((windowMs - (Date.now() - e.at)) / 60_000)} minute(s).`, HttpStatus.TOO_MANY_REQUESTS);
    }
  }
  fail(key: string, windowMs: number) {
    const now = Date.now();
    const e = this.byKey.get(key);
    if (!e || now - e.at >= windowMs) this.byKey.set(key, { n: 1, at: now });
    else e.n++;
  }
  reset(key: string) { this.byKey.delete(key); }
}

@Injectable()
export class LockdownService implements OnApplicationBootstrap {
  private readonly logger = new Logger(LockdownService.name);
  private busy = false;
  private tries = new Tries();
  private lastPersist = 0;

  constructor(
    private prisma: PrismaService,
    private auth: AuthService,
    private audit: AuditService,
    private mail: MailService,
    private scheduler: SchedulerRegistry,
  ) {}

  async onApplicationBootstrap() {
    const s = lockState.current;
    if (s.phase === 'OFF') return;
    this.logger.warn(`Démarrage en état « ${s.phase} » : le site reste verrouillé.`);
    setTimeout(() => this.pauseCrons(), 3000);
    setTimeout(() => this.pauseCrons(), 15000);
    // Un redémarrage pendant le verrouillage : si le coffre n'était pas encore vérifié, on annule (rien n'a été effacé) ;
    // s'il l'était, on termine l'effacement.
    if (s.phase === 'LOCKING') {
      if (s.vaultVerified) void this.finishWipe().catch((e) => this.fail(e));
      else await this.abortLock('Le serveur a redémarré pendant le chiffrement : opération annulée, rien n\'a été effacé.');
    } else if (s.phase === 'RESTORING') {
      lockState.update({ phase: 'LOCKED', step: 'Restauration interrompue : réessaie le déblocage', error: 'Le serveur a redémarré pendant la restauration.', pct: 0 });
    } else if (s.phase === 'LOCKED' && s.vaultVerified && !s.wiped) {
      void this.finishWipe().catch((e) => this.fail(e));
    }
  }

  // ------------------------------------------------------------------ état public

  status() {
    const s = lockState.current;
    return {
      phase: s.phase,
      locked: s.phase !== 'OFF',
      since: s.startedAt ?? null,
      step: s.step ?? null,
      pct: Math.round(s.pct ?? 0),
      error: s.error ?? null,
      summary: s.summary ?? null,
      unlockedAt: s.unlockedAt ?? null,
    };
  }

  // ------------------------------------------------------------------ préparation

  async preflight(actorId: string) {
    const [{ rolsuper }] = await this.prisma.$queryRawUnsafe<{ rolsuper: boolean }[]>(`SELECT rolsuper FROM pg_roles WHERE rolname = current_user`);
    const [{ size }] = await this.prisma.$queryRawUnsafe<{ size: string }[]>(`SELECT pg_database_size(current_database())::text AS size`);
    let fileBytes = 0, fileCount = 0;
    for (const r of fileRoots()) for await (const f of walk(r.dir)) { fileBytes += f.size; fileCount++; }
    let writable = true;
    try { await fs.promises.mkdir(lockdownDir(), { recursive: true }); await fs.promises.access(lockdownDir(), fs.constants.W_OK); } catch { writable = false; }
    let freeBytes: number | null = null;
    try { const st: any = await (fs.promises as any).statfs(lockdownDir()); freeBytes = Number(st.bavail) * Number(st.bsize); } catch { /* indisponible */ }
    const actor = await this.prisma.user.findUnique({ where: { id: actorId }, select: { twoFactorEnabled: true, role: true } });
    const need = fileBytes + Number(size) * 0.5 + 100 * 1024 * 1024;
    return {
      dbSuperuser: !!rolsuper,
      writable,
      dbBytes: Number(size),
      fileBytes,
      fileCount,
      freeBytes,
      enoughSpace: freeBytes === null ? true : freeBytes >= need,
      twoFactor: !!actor?.twoFactorEnabled,
      mailConfigured: this.mail.enabled,
      backupsIncluded: !!process.env.BACKUPS_DIR && fs.existsSync(path.resolve(process.env.BACKUPS_DIR)),
      ready: !!rolsuper && writable && (freeBytes === null || freeBytes >= need) && !!actor?.twoFactorEnabled,
    };
  }

  // ------------------------------------------------------------------ déclenchement

  async start(actorId: string, body: { accountPassword?: string; totpToken?: string; lockPassword?: string; confirmText?: string }, ip?: string | null) {
    if (lockState.current.phase !== 'OFF') throw new BadRequestException('Le site est déjà verrouillé ou en cours de verrouillage');
    if (this.busy) throw new BadRequestException('Une opération est déjà en cours');
    const actor = await this.prisma.user.findUnique({ where: { id: actorId }, select: { id: true, username: true, role: true, status: true, twoFactorEnabled: true } });
    if (!actor || actor.status !== 'ACTIVE' || !['ADMIN', 'OWNER'].includes(actor.role)) throw new ForbiddenException('Réservé aux administrateurs');
    if (!actor.twoFactorEnabled) throw new ForbiddenException("Active d'abord la double authentification (2FA) sur ton compte : l'alerte générale est une action trop puissante pour s'en passer.");
    if (String(body.confirmText ?? '').trim() !== 'VERROUILLER') throw new BadRequestException('Tape VERROUILLER pour confirmer');
    const lockPassword = String(body.lockPassword ?? '');
    if (lockPassword.length < MIN_LOCK_PASSWORD) throw new BadRequestException(`Mot de passe de verrouillage trop court (${MIN_LOCK_PASSWORD} caractères minimum)`);
    if (lockPassword === body.accountPassword) throw new BadRequestException('Choisis un mot de passe de verrouillage différent de celui de ton compte');
    await this.auth.assertStaffReauth(actorId, String(body.accountPassword ?? ''), body.totpToken, ip);

    const pre = await this.preflight(actorId);
    if (!pre.dbSuperuser) throw new BadRequestException("Le compte de la base de données n'a pas les droits nécessaires à la restauration : verrouillage refusé (rien n'a été modifié).");
    if (!pre.writable) throw new BadRequestException("Le dossier du coffre n'est pas accessible en écriture : vérifie le volume Docker « lockdown_storage ».");
    if (!pre.enoughSpace) throw new BadRequestException("Pas assez d'espace disque pour créer le coffre chiffré.");

    this.busy = true;
    const prevEpoch = lockState.current.epoch;
    await this.audit.log(actorId, 'LOCKDOWN_START', { by: actor.username }, ip);
    await this.warnAdmins(actor.username, ip);
    lockState.replace({
      phase: 'LOCKING', epoch: Date.now(), prevEpoch, startedAt: Date.now(), step: 'Préparation', pct: 1, error: null,
      lockedBy: actor.username, vaultVerified: false, wiped: false, unlockedAt: undefined, summary: undefined,
    });
    lockState.fireLock(); // coupe tous les WebSocket ouverts
    this.pauseCrons();
    void this.runLock(lockPassword).catch((e) => this.fail(e)).finally(() => { this.busy = false; });
    return { started: true };
  }

  private async warnAdmins(by: string, ip?: string | null) {
    if (!this.mail.enabled) return;
    try {
      const admins = await this.prisma.user.findMany({ where: { role: { in: ['ADMIN', 'OWNER'] }, status: 'ACTIVE', parentId: null }, select: { email: true } });
      for (const a of admins) {
        await this.mail.send(a.email, '🔒 Alerte générale Seeduction déclenchée',
          `Le site Seeduction vient d'être verrouillé par ${by}${ip ? ` (adresse ${ip})` : ''} : toutes les données sont chiffrées et le site est inaccessible jusqu'à saisie du mot de passe de déverrouillage.\n\nSi ce n'est pas une action prévue, contacte immédiatement les autres administrateurs.`);
      }
    } catch (err: any) { this.logger.warn(`Courriel d'alerte : ${err?.message ?? err}`); }
  }

  // ------------------------------------------------------------------ verrouillage

  private progress(step: string, pct: number, force = false) {
    const now = Date.now();
    if (!force && now - this.lastPersist < 700) { Object.assign(lockState.current as any, { step, pct }); return; }
    this.lastPersist = now;
    lockState.update({ step, pct: Math.max(0, Math.min(99, Math.round(pct))) });
  }

  private pauseCrons() {
    try { for (const job of this.scheduler.getCronJobs().values()) job.stop(); } catch { /* aucun job */ }
  }
  private resumeCrons() {
    try { for (const job of this.scheduler.getCronJobs().values()) job.start(); } catch { /* aucun job */ }
  }

  private async fail(err: any) {
    const msg = String(err?.message ?? err);
    this.logger.error(`Alerte générale : ${msg}`);
    const s = lockState.current;
    if (s.phase === 'LOCKING' && !s.vaultVerified) await this.abortLock(`Verrouillage annulé, rien n'a été effacé : ${msg}`);
    else if (s.phase === 'RESTORING') lockState.update({ phase: 'LOCKED', error: `Restauration impossible : ${msg}`, step: 'Restauration échouée : réessaie', pct: 0 });
    else lockState.update({ error: msg });
  }

  /** Annule un verrouillage qui n'a pas dépassé l'étape de vérification : le site redevient normal, aucune donnée touchée. */
  private async abortLock(message: string) {
    const s = lockState.current;
    if (s.vaultFile) { try { await fs.promises.unlink(path.join(lockdownDir(), s.vaultFile)); } catch { /* absent */ } }
    lockState.replace({ phase: 'OFF', epoch: s.prevEpoch ?? 0, error: message });
    this.resumeCrons();
  }

  private async runLock(password: string) {
    const salt = newSalt();
    this.progress('Dérivation de la clé de chiffrement', 2, true);
    const key = await deriveKey(password, salt);
    const vaultFile = `vault-${new Date().toISOString().replace(/[:.]/g, '-')}.sdv`;
    const vaultPath = path.join(lockdownDir(), vaultFile);
    await fs.promises.mkdir(lockdownDir(), { recursive: true });
    lockState.update({ vaultFile, salt: salt.toString('hex'), verifier: verifierOf(key).toString('hex') });

    const w = await VaultWriter.create(vaultPath, key, salt);
    const expected = { tables: {} as Record<string, number>, files: 0, bytes: 0 };
    try {
      await w.put(FRAME.META, Buffer.from(JSON.stringify({ app: 'seeduction', version: 1, createdAt: new Date().toISOString() })));
      await this.dumpDatabase(w, expected);
      await this.dumpFiles(w, expected);
      await w.put(FRAME.END, Buffer.from(JSON.stringify(expected)));
    } finally {
      await w.close();
    }

    this.progress('Vérification du coffre (relecture complète)', 80, true);
    await this.verifyVault(vaultPath, key, expected);

    const totalRows = Object.values(expected.tables).reduce((a, b) => a + b, 0);
    lockState.update({
      vaultVerified: true,
      summary: { tables: Object.keys(expected.tables).length, rows: totalRows, files: expected.files, bytes: expected.bytes, vaultBytes: (await fs.promises.stat(vaultPath)).size },
    });
    await this.finishWipe();
  }

  private async dumpDatabase(w: VaultWriter, expected: { tables: Record<string, number> }) {
    await this.prisma.$transaction(async (tx) => {
      const tables = (await tx.$queryRawUnsafe<{ t: string }[]>(`SELECT tablename AS t FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations' ORDER BY tablename`)).map((r) => r.t);
      const colRows = await tx.$queryRawUnsafe<{ t: string; c: string }[]>(`SELECT table_name AS t, column_name AS c FROM information_schema.columns WHERE table_schema = 'public' ORDER BY table_name, ordinal_position`);
      const cols = new Map<string, string[]>();
      for (const r of colRows) (cols.get(r.t) ?? cols.set(r.t, []).get(r.t)!).push(r.c);
      const counts: Record<string, number> = {};
      let total = 0;
      for (const t of tables) { counts[t] = Number((await tx.$queryRawUnsafe<{ n: string }[]>(`SELECT count(*)::text AS n FROM ${q(t)}`))[0].n); total += counts[t]; }
      let done = 0;
      for (const t of tables) {
        expected.tables[t] = counts[t];
        let last = '(0,0)';
        let rows = 0;
        while (rows < counts[t]) {
          const [r] = await tx.$queryRawUnsafe<{ j: string; n: string; last: string | null }[]>(
            `SELECT coalesce(jsonb_agg(to_jsonb(x) - 'ctid'), '[]'::jsonb)::text AS j, count(*)::text AS n, (max(x.ctid))::text AS last
               FROM (SELECT ctid, * FROM ${q(t)} WHERE ctid > $1::tid ORDER BY ctid LIMIT ${CHUNK_ROWS}) x`, last);
          const n = Number(r.n);
          if (n === 0 || !r.last) break;
          const hdr = Buffer.from(JSON.stringify({ t, n, cols: cols.get(t) ?? [] }));
          const len = Buffer.alloc(4); len.writeUInt32BE(hdr.length);
          await w.put(FRAME.TABLE_CHUNK, Buffer.concat([len, hdr, Buffer.from(r.j)]));
          last = r.last; rows += n; done += n;
          this.progress(`Chiffrement de la base de données (${t})`, 5 + (done / Math.max(1, total)) * 50);
        }
        if (rows !== counts[t]) throw new Error(`Table ${t} : ${rows} ligne(s) lue(s) sur ${counts[t]}`);
      }
    }, { isolationLevel: 'RepeatableRead' as any, timeout: 6 * 3600_000, maxWait: 30_000 });
  }

  private async dumpFiles(w: VaultWriter, expected: { files: number; bytes: number }) {
    const roots = fileRoots();
    let totalBytes = 0;
    for (const r of roots) for await (const f of walk(r.dir)) totalBytes += f.size;
    let doneBytes = 0;
    for (const r of roots) {
      for await (const f of walk(r.dir)) {
        const hash = createHash('sha256');
        await w.put(FRAME.FILE_BEGIN, Buffer.from(JSON.stringify({ root: r.key, rel: f.rel, size: f.size, mtimeMs: f.mtimeMs })));
        const fh = await fs.promises.open(f.abs, 'r');
        try {
          const buf = Buffer.alloc(FILE_CHUNK);
          let read = 0;
          for (;;) {
            const { bytesRead } = await fh.read(buf, 0, FILE_CHUNK, null);
            if (bytesRead === 0) break;
            const chunk = Buffer.from(buf.subarray(0, bytesRead));
            hash.update(chunk);
            await w.put(FRAME.FILE_DATA, chunk);
            read += bytesRead; doneBytes += bytesRead;
            this.progress(`Chiffrement des fichiers (${r.key})`, 55 + (doneBytes / Math.max(1, totalBytes)) * 24);
          }
          if (read !== f.size) throw new Error(`Fichier modifié pendant la copie : ${r.key}/${f.rel}`);
        } finally { await fh.close(); }
        await w.put(FRAME.FILE_END, Buffer.from(JSON.stringify({ sha256: hash.digest('hex') })));
        expected.files++; expected.bytes += f.size;
      }
    }
  }

  /** Relit le coffre en entier avec le mot de passe : tout doit se déchiffrer, les empreintes et les nombres de lignes doivent correspondre. */
  private async verifyVault(file: string, key: Buffer, expected: { tables: Record<string, number>; files: number; bytes: number }) {
    const r = await VaultReader.open(file);
    try {
      if (!sameBytes(r.verifier, verifierOf(key))) throw new Error('Le coffre ne correspond pas à la clé');
      const rows: Record<string, number> = {};
      let files = 0, bytes = 0, sawEnd = false, hash = createHash('sha256'), fileSize = 0, cur = 0;
      for await (const rec of r.records(key)) {
        if (rec.type === FRAME.TABLE_CHUNK) {
          const hl = rec.body.readUInt32BE(0);
          const hdr = JSON.parse(rec.body.subarray(4, 4 + hl).toString('utf8'));
          const data = JSON.parse(rec.body.subarray(4 + hl).toString('utf8'));
          if (!Array.isArray(data) || data.length !== hdr.n) throw new Error(`Bloc de table ${hdr.t} incohérent`);
          rows[hdr.t] = (rows[hdr.t] ?? 0) + hdr.n;
        } else if (rec.type === FRAME.FILE_BEGIN) { hash = createHash('sha256'); fileSize = JSON.parse(rec.body.toString('utf8')).size; cur = 0; }
        else if (rec.type === FRAME.FILE_DATA) { hash.update(rec.body); cur += rec.body.length; }
        else if (rec.type === FRAME.FILE_END) {
          if (cur !== fileSize || hash.digest('hex') !== JSON.parse(rec.body.toString('utf8')).sha256) throw new Error('Empreinte d\'un fichier incorrecte dans le coffre');
          files++; bytes += fileSize;
        } else if (rec.type === FRAME.END) sawEnd = true;
      }
      if (!sawEnd) throw new Error('Coffre incomplet (marqueur de fin absent)');
      for (const [t, n] of Object.entries(expected.tables)) if ((rows[t] ?? 0) !== n) throw new Error(`Coffre : table ${t} incomplète (${rows[t] ?? 0}/${n})`);
      if (files !== expected.files || bytes !== expected.bytes) throw new Error(`Coffre : fichiers incomplets (${files}/${expected.files})`);
    } finally { await r.close(); }
  }

  /** Dernière étape, irréversible sans le mot de passe : efface les fichiers en clair puis vide toutes les tables. */
  private async finishWipe() {
    const s = lockState.current;
    if (!s.vaultVerified) throw new Error('Effacement refusé : le coffre n\'est pas vérifié');
    this.progress('Effacement des données en clair', 90, true);
    for (const r of fileRoots()) for await (const f of walk(r.dir)) { try { await fs.promises.unlink(f.abs); } catch { /* déjà parti */ } }
    this.progress('Effacement de la base de données', 95, true);
    const tables = (await this.prisma.$queryRawUnsafe<{ t: string }[]>(`SELECT tablename AS t FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`)).map((r) => r.t);
    if (tables.length) await this.prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables.map(q).join(', ')} RESTART IDENTITY CASCADE`);
    lockState.update({ phase: 'LOCKED', wiped: true, step: 'Site verrouillé', pct: 100, error: null });
    this.logger.warn('ALERTE GÉNÉRALE : site verrouillé, données chiffrées dans le coffre.');
  }

  // ------------------------------------------------------------------ déblocage

  async unlock(password: string, ip?: string | null) {
    const s = lockState.current;
    if (s.phase !== 'LOCKED') throw new BadRequestException(s.phase === 'RESTORING' ? 'Restauration déjà en cours' : s.phase === 'LOCKING' ? 'Le verrouillage est encore en cours' : "Le site n'est pas verrouillé");
    if (!s.vaultFile || !s.verifier) throw new BadRequestException('Aucun coffre à ouvrir');
    if (this.busy) throw new BadRequestException('Une opération est déjà en cours');
    const ipKey = `ip:${ip ?? 'unknown'}`;
    this.tries.check(ipKey, 5, 15 * 60_000);
    this.tries.check('all', 30, 60 * 60_000);
    this.busy = true;
    let key: Buffer;
    try {
      const reader = await VaultReader.open(path.join(lockdownDir(), s.vaultFile));
      try { key = await reader.deriveKey(String(password ?? '')); } finally { await reader.close(); }
      if (!sameBytes(verifierOf(key), Buffer.from(s.verifier, 'hex'))) {
        this.tries.fail(ipKey, 15 * 60_000); this.tries.fail('all', 60 * 60_000);
        this.busy = false;
        throw new ForbiddenException('Mot de passe incorrect');
      }
    } catch (err) {
      this.busy = false;
      throw err;
    }
    this.tries.reset(ipKey);
    lockState.update({ phase: 'RESTORING', step: 'Restauration de la base de données', pct: 2, error: null });
    void this.runRestore(key!).catch((e) => this.fail(e)).finally(() => { this.busy = false; });
    return { started: true };
  }

  private async runRestore(key: Buffer) {
    const s = lockState.current;
    const vaultPath = path.join(lockdownDir(), s.vaultFile!);
    const reader = await VaultReader.open(vaultPath);
    try {
      const it = reader.records(key)[Symbol.asyncIterator]();
      let pending: IteratorResult<{ type: number; body: Buffer }> | null = null;
      let expected: { tables: Record<string, number> } | null = null;
      const totalRows = s.summary?.rows ?? 1;
      let doneRows = 0;

      await this.prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL session_replication_role = 'replica'`); // pas de contrôle de clés étrangères pendant le chargement
        const tables = (await tx.$queryRawUnsafe<{ t: string }[]>(`SELECT tablename AS t FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`)).map((r) => r.t);
        const colRows = await tx.$queryRawUnsafe<{ t: string; c: string }[]>(`SELECT table_name AS t, column_name AS c FROM information_schema.columns WHERE table_schema = 'public'`);
        const colsNow = new Map<string, Set<string>>();
        for (const r of colRows) (colsNow.get(r.t) ?? colsNow.set(r.t, new Set()).get(r.t)!).add(r.c);
        if (tables.length) await tx.$executeRawUnsafe(`TRUNCATE TABLE ${tables.map(q).join(', ')} RESTART IDENTITY CASCADE`);

        const loaded: Record<string, number> = {};
        for (;;) {
          const n = await it.next();
          if (n.done) { pending = n; break; }
          const rec = n.value;
          if (rec.type === FRAME.TABLE_CHUNK) {
            const hl = rec.body.readUInt32BE(0);
            const hdr = JSON.parse(rec.body.subarray(4, 4 + hl).toString('utf8')) as { t: string; n: number; cols: string[] };
            const have = colsNow.get(hdr.t);
            if (!have) continue; // table qui n'existe plus dans cette version
            const cols = hdr.cols.filter((c) => have.has(c));
            const list = cols.map(q).join(', ');
            await tx.$executeRawUnsafe(`INSERT INTO ${q(hdr.t)} (${list}) SELECT ${list} FROM jsonb_populate_recordset(null::${q(hdr.t)}, $1::jsonb)`, rec.body.subarray(4 + hl).toString('utf8'));
            loaded[hdr.t] = (loaded[hdr.t] ?? 0) + hdr.n;
            doneRows += hdr.n;
            this.progress('Restauration de la base de données', 3 + (doneRows / Math.max(1, totalRows)) * 60);
          } else if (rec.type === FRAME.META) {
            continue;
          } else { pending = n; break; }
        }
        // Compteurs d'identifiants automatiques (si une table en utilise) : on repart après le plus grand.
        const seqs = await tx.$queryRawUnsafe<{ t: string; c: string; seq: string | null }[]>(
          `SELECT table_name AS t, column_name AS c, pg_get_serial_sequence(quote_ident(table_name), column_name) AS seq FROM information_schema.columns WHERE table_schema = 'public' AND column_default LIKE 'nextval(%'`);
        for (const sq of seqs) if (sq.seq) await tx.$queryRawUnsafe(`SELECT setval($1::regclass, COALESCE((SELECT MAX(${q(sq.c)}) FROM ${q(sq.t)}), 0) + 1, false)`, sq.seq);
        // Contrôle avant validation : chaque table doit contenir exactement ce que le coffre annonce.
        for (const [t, n] of Object.entries(loaded)) {
          const c = Number((await tx.$queryRawUnsafe<{ n: string }[]>(`SELECT count(*)::text AS n FROM ${q(t)}`))[0].n);
          if (c !== n) throw new Error(`Table ${t} : ${c} ligne(s) restaurée(s) sur ${n}`);
        }
      }, { timeout: 6 * 3600_000, maxWait: 60_000 });

      // Fichiers
      this.progress('Restauration des fichiers', 65, true);
      const roots = new Map(fileRoots().map((r) => [r.key, r.dir]));
      for (const [key2, dir] of [['torrents', process.env.TORRENT_STORAGE_DIR ?? './storage/torrents'], ['covers', process.env.COVER_STORAGE_DIR ?? './storage/covers'], ['chat-files', process.env.CHAT_FILE_STORAGE_DIR ?? './storage/chat-files'], ...(process.env.BACKUPS_DIR ? [['backups', process.env.BACKUPS_DIR]] : [])] as [string, string][]) {
        if (!roots.has(key2)) { await fs.promises.mkdir(path.resolve(dir), { recursive: true }); roots.set(key2, path.resolve(dir)); }
      }
      let fh: fs.promises.FileHandle | null = null;
      let target = '';
      let hash = createHash('sha256');
      let size = 0, cur = 0, files = 0;
      const handle = async (rec: { type: number; body: Buffer }) => {
        if (rec.type === FRAME.FILE_BEGIN) {
          const m = JSON.parse(rec.body.toString('utf8')) as { root: string; rel: string; size: number; mtimeMs: number };
          const base = roots.get(m.root);
          if (!base) throw new Error(`Dossier inconnu dans le coffre : ${m.root}`);
          target = path.resolve(base, m.rel);
          if (target !== base && !target.startsWith(base + path.sep)) throw new Error('Chemin de fichier invalide dans le coffre');
          await fs.promises.mkdir(path.dirname(target), { recursive: true });
          fh = await fs.promises.open(target, 'w', 0o600);
          hash = createHash('sha256'); size = m.size; cur = 0;
        } else if (rec.type === FRAME.FILE_DATA) {
          if (!fh) throw new Error('Données de fichier sans en-tête');
          hash.update(rec.body); cur += rec.body.length;
          await fh.write(rec.body);
        } else if (rec.type === FRAME.FILE_END) {
          await fh?.close(); fh = null;
          if (cur !== size || hash.digest('hex') !== JSON.parse(rec.body.toString('utf8')).sha256) throw new Error(`Fichier restauré incorrect : ${target}`);
          files++;
          this.progress('Restauration des fichiers', 65 + (files / Math.max(1, s.summary?.files ?? 1)) * 30);
        } else if (rec.type === FRAME.END) expected = JSON.parse(rec.body.toString('utf8'));
      };
      if (pending && !(pending as IteratorResult<any>).done) await handle((pending as IteratorYieldResult<any>).value);
      for (;;) { const n = await it.next(); if (n.done) break; await handle(n.value); }
      if (!expected) throw new Error('Coffre incomplet : marqueur de fin absent');

      // Le coffre est conservé (renommé) : on ne détruit jamais la seule copie chiffrée automatiquement.
      const used = vaultPath.replace(/\.sdv$/, '') + '.restaure.sdv';
      await reader.close();
      try { await fs.promises.rename(vaultPath, used); } catch { /* garde le nom */ }
      lockState.replace({ phase: 'OFF', epoch: lockState.current.epoch, unlockedAt: Date.now(), vaultFile: undefined, step: undefined, pct: 0, error: null });
      this.resumeCrons();
      await this.audit.log(null, 'LOCKDOWN_UNLOCK', { files, rows: doneRows }).catch(() => {});
      this.logger.warn('ALERTE GÉNÉRALE levée : données restaurées, site rouvert.');
    } finally {
      try { await reader.close(); } catch { /* déjà fermé */ }
    }
  }
}
