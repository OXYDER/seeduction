import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { spawn } from 'child_process';
import { createHash, randomBytes } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PrismaService } from '../common/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';
import { lockState } from '../lockdown/lockdown-state';
import { ZIP_FOLDER, ZIP_GUIDE_NAME, buildGuide } from './backup-guide';
import { ZipPlan, crc32File, planZip } from './zip-writer';
import {
  BackupConfig, BundleRef, bundleName, formatBytes, generatePassphrase, isDue, isSafeBundleName, maskGitUrl, normalizeBackupConfig, parseBundleName, parseDatabaseUrl, selectKeep,
  signDownload, verifyDownload,
} from './backup-utils';

const SETTING_KEY = 'backup';
const FORMAT = 1;
const KEEP_PREDEPLOY = 5;
const RESTORE_TEST_EVERY_DAYS = 6;
const STALE_HOURS = 36;
const ENC_ITER = 600_000;

export interface Actor { userId: string; username: string }
export interface StepRecord { name: string; ok: boolean; ms: number; info?: string }
export interface RunRecord {
  id: string;
  trigger: 'schedule' | 'manual' | 'predeploy';
  kind: 'full' | 'predeploy';
  startedAt: string;
  finishedAt?: string;
  ok?: boolean;
  error?: string;
  file?: string;
  bytes?: number;
  verified?: boolean;
  steps: StepRecord[];
  offsite?: { ok: boolean; info: string } | null;
}
export interface RestoreTestRecord { at: string; ok: boolean; file: string; info: string; ms: number }
interface StatusFile { lastRun?: RunRecord; lastSuccess?: RunRecord; lastRestoreTest?: RestoreTestRecord; history: RunRecord[]; lastStaleAlertAt?: string; lastFailAlertAt?: string }

interface RunOpts { env?: NodeJS.ProcessEnv; cwd?: string; timeoutMs?: number; stdoutFile?: string; stdinFile?: string }
interface RunResult { code: number; stdout: string; stderr: string }

const dirOf = (envName: string, fallback: string) => path.resolve(process.env[envName] ?? fallback);
/** Outil externe : le nom de la commande, ou (réglage par variable d'environnement) un tableau JSON [commande, ...arguments] pour la remplacer. */
const bin = (envName: string, fallback: string): string[] => {
  const v = process.env[envName];
  if (!v) return [fallback];
  if (v.trim().startsWith('[')) { try { const a = JSON.parse(v); if (Array.isArray(a) && a.length) return a.map(String); } catch { /* valeur illisible : défaut */ } }
  return [v];
};
const sha256File = (file: string) => new Promise<string>((resolve, reject) => {
  const h = createHash('sha256');
  fs.createReadStream(file).on('data', (c) => h.update(c)).on('end', () => resolve(h.digest('hex'))).on('error', reject);
});
/** GNU tar sous Windows prend « C:\\dossier » pour une machine distante (« hôte:chemin ») : --force-local l'en empêche. Sans effet utile sous Linux. */
const tarArgs = (a: string[]) => (process.platform === 'win32' ? ['--force-local', ...a] : a);
/** Octets libres sur le disque qui porte `dir` (null si le système ne sait pas le dire). */
const freeBytes = (dir: string): number | null => {
  try { const st = (fs as any).statfsSync(dir); return Number(st.bavail) * Number(st.bsize); } catch { return null; }
};
/** Taille totale d'un dossier (les fichiers à sauvegarder), sans suivre les liens. */
const dirBytes = (dir: string): number => {
  let n = 0;
  const walk = (d: string) => {
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p); else if (e.isFile()) { try { n += fs.statSync(p).size; } catch { /* disparu */ } }
    }
  };
  walk(dir);
  return n;
};
const exists = (p: string) => { try { fs.accessSync(p); return true; } catch { return false; } };
const size = (p: string) => { try { return fs.statSync(p).size; } catch { return 0; } };

@Injectable()
export class BackupService implements OnModuleInit {
  private readonly logger = new Logger(BackupService.name);
  private current: RunRecord | null = null;
  private busy = false;

  constructor(private prisma: PrismaService, private settings: SettingsService, private notifications: NotificationsService, private audit: AuditService) {}

  // ------------------------------------------------------------------ dossiers

  get root() { return dirOf('BACKUPS_DIR', './backups'); }
  get dir() { return path.join(this.root, 'full'); }
  private get projectDir() { return dirOf('PROJECT_DIR', '/host/project'); }
  private get statusFile() { return path.join(this.dir, 'status.json'); }
  private get storageRoots(): { key: string; dir: string }[] {
    return [
      { key: 'torrents', dir: dirOf('TORRENT_STORAGE_DIR', './storage/torrents') },
      { key: 'covers', dir: dirOf('COVER_STORAGE_DIR', './storage/covers') },
      { key: 'chat-files', dir: dirOf('CHAT_FILE_STORAGE_DIR', './storage/chat-files') },
      { key: 'lockdown', dir: dirOf('LOCKDOWN_DIR', './storage/lockdown') },
    ];
  }

  async onModuleInit() {
    try { fs.mkdirSync(this.dir, { recursive: true }); } catch { /* le dossier sera recréé à la première sauvegarde */ }
    // Un redémarrage en pleine sauvegarde (déploiement) laisse un dossier de travail et un état « en cours » orphelins : on les nettoie.
    try {
      for (const e of fs.readdirSync(this.dir)) if (/^\.(work|pack|verify|rt)-|\.part$/.test(e)) fs.rmSync(path.join(this.dir, e), { recursive: true, force: true });
      const st = this.readStatus();
      if (st.lastRun && !st.lastRun.finishedAt) {
        st.lastRun = { ...st.lastRun, finishedAt: new Date().toISOString(), ok: false, error: 'Interrompue (le serveur a redémarré pendant la sauvegarde).' };
        st.history = [st.lastRun, ...st.history.filter((h) => h.id !== st.lastRun!.id)].slice(0, 40);
        this.writeStatus(st);
      }
    } catch { /* sans importance */ }
  }

  // ------------------------------------------------------------------ réglages

  async config(): Promise<BackupConfig> { return normalizeBackupConfig(await this.settings.get(SETTING_KEY)); }

  /** Réglages sans la phrase de récupération (jamais renvoyée au navigateur). */
  async publicConfig() {
    const { passphrase, ...rest } = await this.config();
    return { ...rest, hasPassphrase: !!passphrase };
  }

  async saveConfig(actor: Actor, body: Partial<BackupConfig>, ip?: string | null) {
    const cur = await this.config();
    const next = normalizeBackupConfig({ ...cur, ...body, passphrase: cur.passphrase, passphraseCreatedAt: cur.passphraseCreatedAt, passphraseConfirmedAt: cur.passphraseConfirmedAt });
    await this.settings.set(SETTING_KEY, next);
    await this.audit.log(actor.userId, 'BACKUP_CONFIG', { time: next.time, timezone: next.timezone, enabled: next.enabled, offsite: !!next.offsiteDir, rclone: !!next.rcloneRemote }, ip);
    return this.publicConfig();
  }

  /** Phrase de récupération : créée au premier besoin. Retournée seulement à qui la demande (après ré-authentification). */
  private async ensurePassphrase(): Promise<BackupConfig> {
    const cfg = await this.config();
    if (cfg.passphrase) return cfg;
    const next = { ...cfg, passphrase: generatePassphrase(), passphraseCreatedAt: new Date().toISOString(), passphraseConfirmedAt: null };
    await this.settings.set(SETTING_KEY, next);
    return next;
  }

  async revealPassphrase(actor: Actor, ip?: string | null) {
    const cfg = await this.ensurePassphrase();
    await this.audit.log(actor.userId, 'BACKUP_PASSPHRASE_VIEW', {}, ip);
    return { passphrase: cfg.passphrase, createdAt: cfg.passphraseCreatedAt, confirmedAt: cfg.passphraseConfirmedAt };
  }

  async confirmPassphrase(actor: Actor, ip?: string | null) {
    const cfg = await this.ensurePassphrase();
    await this.settings.set(SETTING_KEY, { ...cfg, passphraseConfirmedAt: new Date().toISOString() });
    await this.audit.log(actor.userId, 'BACKUP_PASSPHRASE_CONFIRM', {}, ip);
    return this.publicConfig();
  }

  // ------------------------------------------------------------------ état

  private readStatus(): StatusFile {
    try { return { history: [], ...JSON.parse(fs.readFileSync(this.statusFile, 'utf8')) }; } catch { return { history: [] }; }
  }
  private writeStatus(st: StatusFile) {
    try {
      fs.mkdirSync(this.dir, { recursive: true });
      const tmp = this.statusFile + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(st, null, 2));
      fs.renameSync(tmp, this.statusFile);
    } catch (err: any) { this.logger.warn(`État des sauvegardes non écrit : ${err?.message ?? err}`); }
  }

  /** Liste des paquets présents (du plus récent au plus ancien), avec le résumé écrit à côté de chacun. */
  list() {
    let names: string[] = [];
    try { names = fs.readdirSync(this.dir); } catch { return []; }
    return names
      .map((name) => ({ name, parsed: parseBundleName(name) }))
      .filter((x): x is { name: string; parsed: NonNullable<ReturnType<typeof parseBundleName>> } => !!x.parsed)
      .map(({ name, parsed }) => {
        let meta: any = null;
        try { meta = JSON.parse(fs.readFileSync(path.join(this.dir, `${name}.json`), 'utf8')); } catch { /* pas de résumé */ }
        return { name, createdAt: parsed.date.toISOString(), bytes: size(path.join(this.dir, name)), encrypted: parsed.encrypted, kind: parsed.predeploy ? 'predeploy' : 'full', meta };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async status() {
    const [cfg, st] = await Promise.all([this.config(), Promise.resolve(this.readStatus())]);
    const files = this.list();
    const now = new Date();
    const lastOk = st.lastSuccess?.finishedAt ? new Date(st.lastSuccess.finishedAt) : null;
    const warnings: { level: 'error' | 'warn'; text: string }[] = [];
    if (!cfg.enabled) warnings.push({ level: 'warn', text: 'Les sauvegardes automatiques sont désactivées.' });
    if (!lastOk) warnings.push({ level: 'error', text: "Aucune sauvegarde complète n'a encore réussi : lance-en une maintenant." });
    else if (now.getTime() - lastOk.getTime() > STALE_HOURS * 3600_000) warnings.push({ level: 'error', text: `La dernière sauvegarde réussie date de plus de ${STALE_HOURS} heures.` });
    if (st.lastRun && st.lastRun.finishedAt && st.lastRun.ok === false) warnings.push({ level: 'error', text: `La dernière tentative a échoué : ${st.lastRun.error ?? 'erreur inconnue'}` });
    if (!cfg.passphrase || !cfg.passphraseConfirmedAt) warnings.push({ level: 'error', text: "Ta phrase de récupération n'est pas confirmée : sans elle, les sauvegardes ne se rouvrent pas si le serveur est perdu. Affiche-la et note-la ailleurs." });
    if (!cfg.offsiteDir && !cfg.rcloneRemote) warnings.push({ level: 'warn', text: "Aucune copie hors du serveur n'est configurée : une panne de la machine emporterait aussi les sauvegardes." });
    if (st.lastRestoreTest && !st.lastRestoreTest.ok) warnings.push({ level: 'error', text: "Le dernier test de restauration a échoué : la sauvegarde ne semble pas restaurable." });
    const free = freeBytes(this.dir);
    const lastBytes = st.lastSuccess?.bytes ?? 0;
    if (free !== null && lastBytes > 0 && free < lastBytes * 2.5) warnings.push({ level: free < lastBytes * 1.5 ? 'error' : 'warn', text: `Il ne reste que ${formatBytes(free)} sur le disque des sauvegardes (un paquet fait ${formatBytes(lastBytes)} et a besoin d'environ le double pendant sa fabrication). Libère de la place : anciens paquets, dossiers backups/db et backups/files des deux sauvegardes d'origine, réglages de rotation.` });
    if (!exists(this.projectDir)) warnings.push({ level: 'warn', text: "Le dossier du projet n'est pas monté dans le conteneur : les fichiers .env et le code ne sont pas inclus (voir docker-compose.yml)." });
    return {
      config: await this.publicConfig(),
      running: this.current,
      lastRun: st.lastRun ?? null,
      lastSuccess: st.lastSuccess ?? null,
      lastRestoreTest: st.lastRestoreTest ?? null,
      history: st.history.slice(0, 15),
      files,
      totalBytes: files.reduce((n, f) => n + f.bytes, 0),
      warnings,
      serverTime: now.toISOString(),
      engine: { projectMounted: exists(this.projectDir), dir: this.dir, freeBytes: free },
    };
  }

  // ------------------------------------------------------------------ lancement

  @Cron('* * * * *')
  async tick() {
    try {
      if (this.busy || lockState.blocking) return;
      const cfg = await this.config();
      const st = this.readStatus();
      const last = st.lastSuccess?.finishedAt ? new Date(st.lastSuccess.finishedAt) : null;
      if (isDue(new Date(), last, cfg)) {
        // Après un échec, on réessaie seulement toutes les 3 heures (inutile de marteler un disque plein).
        const lastTry = st.lastRun?.finishedAt ? new Date(st.lastRun.finishedAt).getTime() : 0;
        if (st.lastRun && st.lastRun.ok === false && Date.now() - lastTry < 3 * 3600_000) return;
        await this.run('schedule');
        return;
      }
      await this.checkStale(cfg, st);
    } catch (err: any) { this.logger.warn(`Planificateur de sauvegardes : ${err?.message ?? err}`); }
  }

  /** Prévient les administrateurs (une fois par jour au plus) quand aucune sauvegarde n'a réussi depuis trop longtemps. */
  private async checkStale(cfg: BackupConfig, st: StatusFile) {
    if (!cfg.enabled || !cfg.notifyFailure || !st.lastSuccess?.finishedAt) return;
    const age = Date.now() - new Date(st.lastSuccess.finishedAt).getTime();
    if (age < STALE_HOURS * 3600_000) return;
    if (st.lastStaleAlertAt && Date.now() - new Date(st.lastStaleAlertAt).getTime() < 24 * 3600_000) return;
    st.lastStaleAlertAt = new Date().toISOString();
    this.writeStatus(st);
    await this.notifyAdmins('⚠️ Sauvegarde en retard', `Aucune sauvegarde complète n'a réussi depuis plus de ${STALE_HOURS} heures. Ouvre Admin > Sauvegardes.`);
  }

  private async notifyAdmins(title: string, body: string) {
    try {
      const admins = await this.prisma.user.findMany({ where: { role: { in: ['ADMIN', 'OWNER'] }, status: 'ACTIVE', parentId: null }, select: { id: true } });
      await Promise.all(admins.map((a) => this.notifications.notify({ userId: a.id, type: 'SYSTEM', category: 'system', title, body: body.slice(0, 220), link: '/admin?tab=Sauvegardes', groupKey: 'backup-alert' }).catch(() => undefined)));
    } catch { /* la notification ne doit jamais faire échouer la sauvegarde */ }
  }

  /** Démarre une sauvegarde sans attendre la fin (le suivi se fait par `status()`). */
  start(trigger: 'manual' | 'predeploy', actor?: Actor, ip?: string | null) {
    if (this.busy) throw new BadRequestException('Une sauvegarde est déjà en cours.');
    if (lockState.blocking) throw new BadRequestException("Impossible pendant l'alerte générale.");
    if (actor) void this.audit.log(actor.userId, 'BACKUP_RUN', { trigger }, ip);
    void this.run(trigger);
    return { started: true };
  }

  /** Pour backup.sh (en SSH, depuis le conteneur) : sauvegarde complète attendue jusqu'au bout. */
  async runAndWait() {
    if (this.busy) return { ok: false, skipped: 'busy' };
    if (lockState.blocking) return { ok: false, error: "Impossible pendant l'alerte générale." };
    const rec = await this.run('manual');
    return { ok: !!rec?.ok, file: rec?.file, bytes: rec?.bytes, error: rec?.error, offsite: rec?.offsite ?? null };
  }

  /** Pour deploy.sh : sauvegarde rapide de la base seule, attendue jusqu'au bout (le déploiement attend). */
  async runPredeploy() {
    if (this.busy) return { ok: false, skipped: 'busy' };
    const rec = await this.run('predeploy');
    return { ok: !!rec?.ok, file: rec?.file, error: rec?.error };
  }

  private async run(trigger: RunRecord['trigger']): Promise<RunRecord | null> {
    if (this.busy) return null;
    this.busy = true;
    const kind: RunRecord['kind'] = trigger === 'predeploy' ? 'predeploy' : 'full';
    const id = randomBytes(4).toString('hex');
    const rec: RunRecord = { id, trigger, kind, startedAt: new Date().toISOString(), steps: [] };
    this.current = rec;
    const work = path.join(this.dir, `.work-${id}`);
    const t0 = Date.now();
    const cfg = await this.ensurePassphrase();
    const persist = () => { const st = this.readStatus(); st.lastRun = { ...rec }; this.writeStatus(st); };
    const step = async <T>(name: string, fn: () => Promise<T>, info?: (r: T) => string | undefined): Promise<T> => {
      const s = Date.now();
      try {
        const r = await fn();
        rec.steps.push({ name, ok: true, ms: Date.now() - s, info: info?.(r) });
        return r;
      } catch (e: any) {
        rec.steps.push({ name, ok: false, ms: Date.now() - s, info: String(e?.message ?? e).slice(0, 300) });
        throw e;
      } finally { persist(); }
    };

    try {
      fs.mkdirSync(work, { recursive: true });
      fs.mkdirSync(path.join(work, 'files'), { recursive: true });
      fs.mkdirSync(path.join(work, 'config'), { recursive: true });
      persist();

      await step('Contrôle de la place disponible', () => this.assertSpace(kind), (r) => `${formatBytes(r.free)} libres, ${formatBytes(r.need)} nécessaires`);
      const db = await step('Base de données', () => this.dumpDatabase(work), (r) => `${formatBytes(r.bytes)} · ${r.entries} objets · ${r.counts.users} membres, ${r.counts.torrents} torrents`);
      const files: Record<string, { bytes: number; sha256: string }> = {};
      let source: { bytes: number; sha256: string } | null = null;
      let configInfo: { present: string[]; missing: string[]; git: any } = { present: [], missing: [], git: null };
      if (kind === 'full') {
        Object.assign(files, await step('Fichiers (.torrent, pochettes, pièces jointes, coffre)', () => this.archiveFiles(work), (r) => Object.entries(r).map(([k, v]) => `${k} ${formatBytes(v.bytes)}`).join(' · ')));
      }
      configInfo = await step('Configuration et secrets (.env)', () => this.collectConfig(work), (r) => `${r.present.length} fichier(s)${r.missing.length ? ` · absents : ${r.missing.join(', ')}` : ''}`);
      if (kind === 'full') source = await step('Code du site', () => this.archiveSource(work), (r) => (r ? formatBytes(r.bytes) : 'dossier du projet non monté'));

      const manifest = {
        format: FORMAT, kind, createdAt: rec.startedAt, host: os.hostname(), appVersion: this.appVersion(), trigger,
        git: configInfo.git, database: { name: parseDatabaseUrl(process.env.DATABASE_URL ?? '')?.database ?? null, ...db },
        files, source, config: { present: configInfo.present, missing: configInfo.missing },
        volumes: this.storageRoots.map((r) => r.key),
        note: "Ce paquet contient tout le nécessaire pour remettre le site en ligne sur n'importe quelle machine avec Docker : voir LISEZ-MOI.txt (restaurer.sh).",
      };
      fs.writeFileSync(path.join(work, 'manifest.json'), JSON.stringify(manifest, null, 2));
      fs.writeFileSync(path.join(work, 'LISEZ-MOI.txt'), this.readme(manifest));

      const name = bundleName(new Date(), { encrypted: true, predeploy: kind === 'predeploy' });
      const out = await step('Emballage et chiffrement', () => this.pack(work, name, cfg.passphrase), (r) => `${formatBytes(r.bytes)} (AES-256)`);
      rec.file = name; rec.bytes = out.bytes;

      rec.verified = await step('Vérification du paquet', () => this.verifyBundle(path.join(this.dir, name), cfg.passphrase), () => 'relu et déchiffré sans erreur');
      fs.writeFileSync(path.join(this.dir, `${name}.json`), JSON.stringify({ createdAt: rec.startedAt, kind, bytes: out.bytes, sha256: out.sha256, verified: rec.verified, appVersion: manifest.appVersion, git: manifest.git, database: manifest.database, files: Object.fromEntries(Object.entries(files).map(([k, v]) => [k, v.bytes])), configPresent: configInfo.present }, null, 2));

      await step('Rotation des anciens paquets', async () => this.prune(cfg), (r) => (r > 0 ? `${r} ancien(s) supprimé(s)` : 'rien à supprimer'));
      this.installHelpers();
      if (kind === 'full') {
        rec.offsite = await this.copyOffsite(name, cfg).catch((e: any) => ({ ok: false, info: String(e?.message ?? e).slice(0, 300) }));
        if (rec.offsite) rec.steps.push({ name: 'Copie hors du serveur', ok: rec.offsite.ok, ms: 0, info: rec.offsite.info });
      }

      rec.ok = true;
      rec.finishedAt = new Date().toISOString();
      { const st = this.readStatus(); if (st.lastFailAlertAt) { delete st.lastFailAlertAt; this.writeStatus(st); } }
      this.finish(rec);
      this.logger.log(`Sauvegarde ${kind} terminée : ${name} (${formatBytes(out.bytes)}) en ${Math.round((Date.now() - t0) / 1000)} s`);
      if (kind === 'full') this.maybeRestoreTest().catch(() => undefined);
    } catch (err: any) {
      rec.ok = false;
      rec.error = this.friendlyError(String(err?.message ?? err)).slice(0, 600);
      rec.finishedAt = new Date().toISOString();
      this.finish(rec);
      this.logger.error(`Sauvegarde ${kind} échouée : ${rec.error}`);
      // Une seule alerte par série d'échecs (puis un rappel par jour) : pas 22 notifications pour le même disque plein.
      if (cfg.notifyFailure && trigger !== 'predeploy') {
        const st = this.readStatus();
        if (!st.lastFailAlertAt || Date.now() - new Date(st.lastFailAlertAt).getTime() > 24 * 3600_000) {
          st.lastFailAlertAt = new Date().toISOString();
          this.writeStatus(st);
          await this.notifyAdmins('❌ Sauvegarde échouée', this.friendlyError(rec.error));
        }
      }
    } finally {
      try { fs.rmSync(work, { recursive: true, force: true }); } catch { /* nettoyé au prochain démarrage */ }
      this.current = null;
      this.busy = false;
    }
    return rec;
  }

  /** Ajoute au message d'erreur technique ce qu'il faut faire quand le disque est plein. */
  private friendlyError(msg: string) {
    if (!/No space left|ENOSPC|Espace insuffisant/i.test(msg)) return msg;
    return `${msg} — ${this.diskInfo()} Si le disque principal a pourtant de la place : vérifie le quota du dossier partagé, la partition où se trouve le dossier du site (« df -h » dans ce dossier) et les inodes (« df -i »).`;
  }

  /** Ce que le serveur voit réellement du disque des sauvegardes (utile quand « disque plein » surprend : quota, petite partition, inodes). */
  private diskInfo() {
    try {
      const st = (fs as any).statfsSync(this.dir);
      const free = Number(st.bavail) * Number(st.bsize), total = Number(st.blocks) * Number(st.bsize);
      return `Disque des sauvegardes vu par le serveur : ${formatBytes(free)} libres sur ${formatBytes(total)}, ${Number(st.ffree).toLocaleString('fr-CA')} inodes libres (${this.dir}).`;
    } catch { return `Disque des sauvegardes : ${this.dir}.`; }
  }

  private finish(rec: RunRecord) {
    const st = this.readStatus();
    st.lastRun = { ...rec };
    if (rec.ok && rec.kind === 'full') st.lastSuccess = { ...rec };
    st.history = [{ ...rec }, ...st.history.filter((h) => h.id !== rec.id)].slice(0, 40);
    this.writeStatus(st);
  }

  // ------------------------------------------------------------------ étapes

  private run_(tool: string | string[], args: string[], o: RunOpts = {}): Promise<RunResult> {
    const [cmd, ...pre] = Array.isArray(tool) ? tool : [tool];
    return new Promise((resolve, reject) => {
      let out: number | 'pipe' = 'pipe';
      let outFd: number | null = null;
      let inFd: number | null = null;
      if (o.stdoutFile) { outFd = fs.openSync(o.stdoutFile, 'w'); out = outFd; }
      if (o.stdinFile) inFd = fs.openSync(o.stdinFile, 'r');
      const child = spawn(cmd, [...pre, ...args], { env: { ...process.env, ...o.env }, cwd: o.cwd, stdio: [inFd ?? 'ignore', out, 'pipe'] });
      let stdout = '', stderr = '';
      child.stdout?.on('data', (c) => { if (stdout.length < 200_000) stdout += c; });
      child.stderr?.on('data', (c) => { if (stderr.length < 20_000) stderr += c; });
      const timer = setTimeout(() => { child.kill('SIGKILL'); }, o.timeoutMs ?? 30 * 60_000);
      const done = () => { clearTimeout(timer); if (outFd !== null) fs.closeSync(outFd); if (inFd !== null) fs.closeSync(inFd); };
      child.on('error', (e: any) => { done(); reject(new Error(e?.code === 'ENOENT' ? `Outil introuvable : ${cmd}` : String(e?.message ?? e))); });
      child.on('close', (code) => { done(); resolve({ code: code ?? -1, stdout, stderr }); });
    });
  }
  private async must(cmd: string | string[], args: string[], o: RunOpts = {}, what = Array.isArray(cmd) ? cmd[0] : cmd) {
    const r = await this.run_(cmd, args, o);
    if (r.code !== 0) throw new Error(`${what} a échoué (code ${r.code}) : ${(r.stderr || r.stdout).trim().split('\n').slice(-3).join(' ').slice(0, 300)}`);
    return r;
  }

  private pgEnv() {
    const p = parseDatabaseUrl(process.env.DATABASE_URL ?? '');
    if (!p) throw new Error('DATABASE_URL absente ou illisible');
    return { p, env: { PGPASSWORD: p.password } as NodeJS.ProcessEnv, conn: ['-h', p.host, '-p', p.port, '-U', p.user] };
  }

  /**
   * Refuse de commencer s'il n'y a pas assez de place : un dossier de travail (≈ la taille des données) PLUS le paquet chiffré (≈ la même taille)
   * existent en même temps. Mieux vaut un message clair tout de suite qu'un disque saturé à mi-chemin.
   */
  private async assertSpace(kind: RunRecord['kind']) {
    let data = 0;
    try { data += Number((await this.prisma.$queryRaw<{ s: bigint }[]>`SELECT pg_database_size(current_database()) AS s`)[0]?.s ?? 0); } catch { /* estimation seulement */ }
    if (kind === 'full') {
      for (const r of this.storageRoots) if (exists(r.dir)) data += dirBytes(r.dir);
      data += 60 * 1024 * 1024; // code du site
    }
    const need = Math.round(data * 2.2);
    const free = freeBytes(this.dir);
    if (free !== null && free < need) throw new Error(`Espace insuffisant : il reste ${formatBytes(free)} et la sauvegarde en demande environ ${formatBytes(need)}.`);
    return { free: free ?? 0, need };
  }

  private async dumpDatabase(work: string) {
    const { p, env, conn } = this.pgEnv();
    const file = path.join(work, 'db.dump');
    await this.must(bin('PG_DUMP_BIN', 'pg_dump'), [...conn, '-d', p.database, '--format=custom', '--no-owner', '--no-privileges', '-f', file], { env }, 'pg_dump');
    const list = await this.must(bin('PG_RESTORE_BIN', 'pg_restore'), ['--list', file], { env }, 'Relecture de la sauvegarde de la base');
    const entries = list.stdout.split('\n').filter((l) => l.trim() && !l.startsWith(';')).length;
    if (entries < 10) throw new Error(`La sauvegarde de la base semble vide (${entries} objets)`);
    const counts = await this.counts();
    return { bytes: size(file), sha256: await sha256File(file), entries, counts };
  }

  private async counts() {
    const [users, torrents, posts, messages] = await Promise.all([
      this.prisma.user.count(), this.prisma.torrent.count(), this.prisma.forumPost.count(), this.prisma.message.count(),
    ]);
    return { users, torrents, posts, messages };
  }

  private async archiveFiles(work: string) {
    const out: Record<string, { bytes: number; sha256: string }> = {};
    for (const r of this.storageRoots) {
      if (!exists(r.dir)) continue;
      const file = path.join(work, 'files', `${r.key}.tar.gz`);
      await this.must(bin('TAR_BIN', 'tar'), tarArgs(['-czf', file, '-C', r.dir, '.']), {}, `Archive ${r.key}`);
      out[r.key] = { bytes: size(file), sha256: await sha256File(file) };
    }
    return out;
  }

  /** Lit le dépôt git sans l'outil git : adresse d'origine (sans identifiants), branche et révision actuelles. */
  private gitInfo() {
    try {
      const gd = path.join(this.projectDir, '.git');
      const head = fs.readFileSync(path.join(gd, 'HEAD'), 'utf8').trim();
      let branch: string | null = null, commit = head;
      if (head.startsWith('ref: ')) {
        const ref = head.slice(5);
        branch = ref.replace(/^refs\/heads\//, '');
        try { commit = fs.readFileSync(path.join(gd, ref), 'utf8').trim(); }
        catch {
          const packed = fs.readFileSync(path.join(gd, 'packed-refs'), 'utf8').split('\n').find((l) => l.endsWith(` ${ref}`));
          commit = packed ? packed.split(' ')[0] : '';
        }
      }
      let remote: string | null = null;
      try {
        const cfg = fs.readFileSync(path.join(gd, 'config'), 'utf8');
        const m = /\[remote "origin"\][^[]*?url\s*=\s*(.+)/.exec(cfg);
        if (m) remote = maskGitUrl(m[1].trim());
      } catch { /* pas d'origine */ }
      return { remote, branch, commit: commit || null };
    } catch { return null; }
  }

  private appVersion(): string | null {
    for (const f of [path.join(process.cwd(), 'changelog.txt'), path.join(this.projectDir, 'backend', 'changelog.txt')]) {
      try { const m = /^COUNT=(\d+)/m.exec(fs.readFileSync(f, 'utf8')); if (m) return `1.0.${m[1]}`; } catch { /* suivant */ }
    }
    return null;
  }

  private async collectConfig(work: string) {
    const present: string[] = [], missing: string[] = [];
    const git = this.gitInfo();
    const wanted: [string, string][] = [['.env', 'env'], ['backend/.env', 'backend.env'], ['docker-compose.yml', 'docker-compose.yml'], ['docker-compose.override.yml', 'docker-compose.override.yml']];
    if (!exists(this.projectDir)) return { present, missing: wanted.map((w) => w[0]), git };
    for (const [rel, dest] of wanted) {
      const src = path.join(this.projectDir, rel);
      if (exists(src) && fs.statSync(src).isFile()) { fs.copyFileSync(src, path.join(work, 'config', dest)); present.push(rel); }
      else if (rel !== 'docker-compose.override.yml') missing.push(rel);
    }
    return { present, missing, git };
  }

  private async archiveSource(work: string) {
    if (!exists(this.projectDir)) return null;
    const file = path.join(work, 'source.tar.gz');
    const ex = ['node_modules', 'dist', '.git', 'backups', 'storage', '_captures', 'desktop-player/node_modules', 'desktop-player/vendor', 'desktop-player/dist', 'desktop-player/build', '.env', 'backend/.env', '*.log'];
    await this.must(bin('TAR_BIN', 'tar'), tarArgs(['-czf', file, ...ex.flatMap((e) => ['--exclude', e]), '-C', this.projectDir, '.']), {}, 'Archive du code');
    return { bytes: size(file), sha256: await sha256File(file) };
  }

  private readme(m: any) {
    return [
      'SAUVEGARDE COMPLÈTE DE SEEDUCTION',
      '=================================',
      `Créée le : ${m.createdAt}   Machine : ${m.host}   Version : ${m.appVersion ?? '?'}   Révision : ${m.git?.commit?.slice(0, 10) ?? '?'}`,
      '',
      'CONTENU',
      '  db.dump            base de données PostgreSQL (membres, torrents, forum, messages...)',
      '  files/*.tar.gz     fichiers .torrent, pochettes, pièces jointes du chat, coffre « Alerte générale »',
      '  config/            .env (secrets : JWT_SECRET, SMTP, clés API...), backend.env, docker-compose.yml',
      '  source.tar.gz      copie du code du site (utile si GitHub est inaccessible)',
      '  manifest.json      description et empreintes de chaque élément',
      '',
      'REMETTRE LE SITE EN LIGNE (sur n\'importe quelle machine avec Docker)',
      '  1. Installe Docker (Linux : « curl -fsSL https://get.docker.com | sh »).',
      '  2. Copie ce paquet (.tar.enc) et le script restaurer.sh sur la machine (le ZIP téléchargé depuis Admin > Sauvegardes contient les deux et un mode d\'emploi).',
      '  3. Lance :  bash restaurer.sh seeduction-backup-AAAAMMJJ-HHMMSS.tar.enc',
      '     (il demande la phrase de récupération, puis fait tout : fichiers, base, configuration, démarrage).',
      '  4. Dernière étape à la main : pointer ton nom de domaine et ton proxy (Nginx Proxy Manager) vers la nouvelle machine.',
      '',
      'Détails : BACKUP.md dans le dépôt du site.',
    ].join('\n');
  }

  /** Enchaîne deux commandes (A | B) sans fichier intermédiaire : la sortie de A est l'entrée de B. */
  private pipe(a: { tool: string[]; args: string[]; env?: NodeJS.ProcessEnv; cwd?: string }, b: { tool: string[]; args: string[]; env?: NodeJS.ProcessEnv; cwd?: string }, timeoutMs = 60 * 60_000) {
    return new Promise<{ codeA: number; codeB: number; stdout: string; stderrA: string; stderrB: string }>((resolve, reject) => {
      const [ca, ...pa] = a.tool, [cb, ...pb] = b.tool;
      const A = spawn(ca, [...pa, ...a.args], { env: { ...process.env, ...a.env }, cwd: a.cwd, stdio: ['ignore', 'pipe', 'pipe'] });
      const B = spawn(cb, [...pb, ...b.args], { env: { ...process.env, ...b.env }, cwd: b.cwd, stdio: ['pipe', 'pipe', 'pipe'] });
      let stdout = '', stderrA = '', stderrB = '', codeA = -1, codeB = -1, closed = 0, failed = false;
      const fail = (e: any, cmd: string) => { if (failed) return; failed = true; A.kill('SIGKILL'); B.kill('SIGKILL'); reject(new Error(e?.code === 'ENOENT' ? `Outil introuvable : ${cmd}` : String(e?.message ?? e))); };
      const timer = setTimeout(() => { A.kill('SIGKILL'); B.kill('SIGKILL'); }, timeoutMs);
      A.on('error', (e) => fail(e, ca)); B.on('error', (e) => fail(e, cb));
      B.stdin.on('error', () => { /* B a fini avant d'avoir tout lu (ex. extraction d'un seul fichier) */ });
      A.stdout.pipe(B.stdin);
      A.stderr.on('data', (c) => { if (stderrA.length < 10_000) stderrA += c; });
      B.stderr.on('data', (c) => { if (stderrB.length < 10_000) stderrB += c; });
      B.stdout.on('data', (c) => { if (stdout.length < 400_000) stdout += c; });
      const end = () => { if (++closed === 2) { clearTimeout(timer); if (!failed) resolve({ codeA, codeB, stdout, stderrA, stderrB }); } };
      A.on('close', (c) => { codeA = c ?? -1; end(); });
      B.on('close', (c) => { codeB = c ?? -1; end(); });
    });
  }

  private encArgs(extra: string[]) { return ['enc', ...extra, '-aes-256-cbc', '-pbkdf2', '-iter', String(ENC_ITER), '-pass', 'env:SEED_BACKUP_PASS']; }

  /** tar | openssl : le paquet chiffré est écrit directement, sans copie « en clair » intermédiaire (qui doublerait la place nécessaire). */
  private async pack(work: string, name: string, pass: string) {
    const finalFile = path.join(this.dir, name);
    try {
      const r = await this.pipe(
        { tool: bin('TAR_BIN', 'tar'), args: tarArgs(['-cf', '-', '-C', work, '.']) },
        { tool: bin('OPENSSL_BIN', 'openssl'), args: [...this.encArgs(['-salt']), '-out', finalFile + '.part'], env: { SEED_BACKUP_PASS: pass } },
      );
      if (r.codeA !== 0) throw new Error(`Emballage échoué : ${r.stderrA.trim().split('\n').slice(-2).join(' ').slice(0, 250)}`);
      if (r.codeB !== 0) throw new Error(`Chiffrement échoué : ${r.stderrB.trim().split('\n').slice(-2).join(' ').slice(0, 250)}`);
      fs.renameSync(finalFile + '.part', finalFile);
    } finally {
      try { fs.rmSync(finalFile + '.part', { force: true }); } catch { /* ignoré */ }
    }
    const sha256 = await sha256File(finalFile);
    fs.writeFileSync(`${finalFile}.sha256`, `${sha256}  ${name}\n`);
    return { bytes: size(finalFile), sha256 };
  }

  /** openssl -d | tar : relit tout le paquet sans rien écrire sur le disque. */
  private async verifyBundle(file: string, pass: string) {
    const r = await this.pipe(
      { tool: bin('OPENSSL_BIN', 'openssl'), args: [...this.encArgs(['-d']), '-in', file], env: { SEED_BACKUP_PASS: pass } },
      { tool: bin('TAR_BIN', 'tar'), args: tarArgs(['-tf', '-']) },
    );
    if (r.codeA !== 0) throw new Error(`Le paquet ne se déchiffre pas : ${r.stderrA.trim().slice(0, 200)}`);
    if (r.codeB !== 0) throw new Error(`Le paquet déchiffré est illisible : ${r.stderrB.trim().slice(0, 200)}`);
    if (!/manifest\.json/.test(r.stdout) || !/db\.dump/.test(r.stdout)) throw new Error('Le paquet relu est incomplet (manifest.json ou db.dump manquant)');
    return true;
  }

  /** Extrait quelques fichiers du paquet (déchiffrement en flux : seul le contenu demandé est écrit). */
  private async extractFromBundle(file: string, pass: string, into: string, members: string[]) {
    const r = await this.pipe(
      { tool: bin('OPENSSL_BIN', 'openssl'), args: [...this.encArgs(['-d']), '-in', file], env: { SEED_BACKUP_PASS: pass } },
      { tool: bin('TAR_BIN', 'tar'), args: tarArgs(['-xf', '-', ...members]), cwd: into },
    );
    // openssl peut être interrompu quand tar a fini d'extraire ce qu'on lui demandait : seul compte ce qui a été extrait.
    if (r.codeB !== 0 || !members.every((m) => exists(path.join(into, m)))) throw new Error(`Extraction du paquet impossible : ${(r.stderrA || r.stderrB).trim().slice(0, 200) || 'phrase incorrecte ou paquet abîmé'}`);
  }

  // ------------------------------------------------------------------ rotation et copie externe

  private bundleRefs(names: string[], predeploy: boolean): BundleRef[] {
    return names.map((name) => ({ name, p: parseBundleName(name) })).filter((x) => x.p && x.p.predeploy === predeploy).map((x) => ({ name: x.name, date: x.p!.date }));
  }

  private keepSet(names: string[], cfg: BackupConfig) {
    const keep = selectKeep(this.bundleRefs(names, false), cfg);
    const pre = this.bundleRefs(names, true).sort((a, b) => b.date.getTime() - a.date.getTime());
    pre.slice(0, KEEP_PREDEPLOY).forEach((b) => keep.add(b.name));
    return keep;
  }

  private prune(cfg: BackupConfig) {
    let names: string[] = [];
    try { names = fs.readdirSync(this.dir).filter((n) => !!parseBundleName(n)); } catch { return 0; }
    const keep = this.keepSet(names, cfg);
    let removed = 0;
    for (const n of names) {
      if (keep.has(n)) continue;
      for (const f of [n, `${n}.json`, `${n}.sha256`]) { try { fs.rmSync(path.join(this.dir, f), { force: true }); } catch { /* ignoré */ } }
      removed++;
    }
    return removed;
  }

  /** Copie le dernier paquet (et la clé de lecture) vers le dossier externe et/ou la destination rclone, puis y applique la même rotation. */
  private async copyOffsite(name: string, cfg: BackupConfig): Promise<{ ok: boolean; info: string } | null> {
    const parts: string[] = [];
    let ok = true;
    const files = [name, `${name}.sha256`];
    if (cfg.offsiteDir) {
      try {
        fs.mkdirSync(cfg.offsiteDir, { recursive: true });
        for (const f of files) fs.copyFileSync(path.join(this.dir, f), path.join(cfg.offsiteDir, f));
        for (const h of ['RESTAURER.sh', 'LISEZ-MOI.txt']) { const s = path.join(this.dir, h); if (exists(s)) fs.copyFileSync(s, path.join(cfg.offsiteDir, h)); }
        const names = fs.readdirSync(cfg.offsiteDir).filter((n) => !!parseBundleName(n));
        const keep = this.keepSet(names, cfg);
        for (const n of names) if (!keep.has(n)) for (const f of [n, `${n}.sha256`]) fs.rmSync(path.join(cfg.offsiteDir, f), { force: true });
        parts.push(`dossier ${cfg.offsiteDir} ✓`);
      } catch (e: any) { ok = false; parts.push(`dossier ${cfg.offsiteDir} ✗ (${String(e?.message ?? e).slice(0, 120)})`); }
    }
    if (cfg.rcloneRemote) {
      try {
        const conf = path.join(this.root, 'rclone.conf');
        const base = exists(conf) ? ['--config', conf] : [];
        const remote = cfg.rcloneRemote.replace(/\/+$/, '');
        for (const f of files) await this.must(bin('RCLONE_BIN', 'rclone'), [...base, 'copyto', path.join(this.dir, f), `${remote}/${f}`], { timeoutMs: 6 * 3600_000 }, 'rclone');
        const ls = await this.run_(bin('RCLONE_BIN', 'rclone'), [...base, 'lsf', remote]);
        if (ls.code === 0) {
          const names = ls.stdout.split('\n').map((s) => s.trim()).filter((n) => !!parseBundleName(n));
          const keep = this.keepSet(names, cfg);
          for (const n of names) if (!keep.has(n)) { await this.run_(bin('RCLONE_BIN', 'rclone'), [...base, 'deletefile', `${remote}/${n}`]); await this.run_(bin('RCLONE_BIN', 'rclone'), [...base, 'deletefile', `${remote}/${n}.sha256`]); }
        }
        parts.push(`rclone ${cfg.rcloneRemote} ✓`);
      } catch (e: any) { ok = false; parts.push(`rclone ✗ (${String(e?.message ?? e).slice(0, 160)})`); }
    }
    if (parts.length === 0) return null;
    return { ok, info: parts.join(' · ') };
  }

  /** Dépose à côté des paquets le script de restauration et un mode d'emploi : quelqu'un qui n'a QUE le dossier de sauvegardes peut s'en sortir. */
  private installHelpers() {
    try {
      const restore = this.restoreScript();
      if (restore) fs.writeFileSync(path.join(this.dir, 'RESTAURER.sh'), restore, { mode: 0o755 });
      fs.writeFileSync(path.join(this.dir, 'LISEZ-MOI.txt'), [
        'SAUVEGARDES DE SEEDUCTION',
        '',
        'Chaque fichier seeduction-backup-*.tar.enc est une sauvegarde COMPLÈTE et chiffrée du site (base, fichiers, configuration, code).',
        'Pour remettre le site en ligne sur une machine neuve (Docker installé) :',
        '    bash RESTAURER.sh seeduction-backup-AAAAMMJJ-HHMMSS.tar.enc',
        'Le script demande la PHRASE DE RÉCUPÉRATION (affichée dans Admin > Sauvegardes, à noter hors du serveur), puis fait tout le reste.',
        'Sans cette phrase, un paquet est illisible : c\'est voulu (il contient les mots de passe et les clés du site).',
        '',
        'Les fichiers seeduction-predeploy-* sont des instantanés de la base pris juste avant chaque mise à jour.',
      ].join('\n'));
    } catch { /* facultatif */ }
  }

  // ------------------------------------------------------------------ test de restauration

  private async maybeRestoreTest() {
    const st = this.readStatus();
    const last = st.lastRestoreTest ? new Date(st.lastRestoreTest.at).getTime() : 0;
    if (Date.now() - last < RESTORE_TEST_EVERY_DAYS * 86400_000) return;
    await this.restoreTest().catch(() => undefined);
  }

  /**
   * Preuve que la sauvegarde sert : on déchiffre le dernier paquet, on recharge sa base dans une base jetable à côté de la vraie, on compare
   * le nombre de membres et de torrents avec ce que le paquet annonçait, puis on supprime la base jetable. Rien d'autre n'est touché.
   */
  async restoreTest(actor?: Actor, ip?: string | null): Promise<RestoreTestRecord> {
    const latest = this.list().find((f) => f.kind === 'full');
    const t0 = Date.now();
    const record = (ok: boolean, file: string, info: string): RestoreTestRecord => {
      const r = { at: new Date().toISOString(), ok, file, info, ms: Date.now() - t0 };
      const st = this.readStatus(); st.lastRestoreTest = r; this.writeStatus(st);
      return r;
    };
    if (!latest) return record(false, '', 'Aucun paquet à tester.');
    if (actor) void this.audit.log(actor.userId, 'BACKUP_RESTORE_TEST', { file: latest.name }, ip);
    const cfg = await this.config();
    const { p, env, conn } = this.pgEnv();
    const scratch = `restoretest_${randomBytes(3).toString('hex')}`;
    const tmp = path.join(this.dir, `.rt-${randomBytes(3).toString('hex')}`);
    let created = false;
    try {
      fs.mkdirSync(tmp, { recursive: true });
      await this.extractFromBundle(path.join(this.dir, latest.name), cfg.passphrase, tmp, ['./db.dump', './manifest.json']);
      const manifest = JSON.parse(fs.readFileSync(path.join(tmp, 'manifest.json'), 'utf8'));
      await this.must(bin('PSQL_BIN', 'psql'), [...conn, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', `CREATE DATABASE "${scratch}"`], { env }, 'Création de la base jetable');
      created = true;
      const r = await this.run_(bin('PG_RESTORE_BIN', 'pg_restore'), [...conn, '-d', scratch, '--no-owner', '--no-privileges', path.join(tmp, 'db.dump')], { env });
      if (r.code > 1) throw new Error(`pg_restore : ${(r.stderr || '').trim().split('\n').slice(-2).join(' ').slice(0, 200)}`);
      const count = async (table: string) => Number((await this.must(bin('PSQL_BIN', 'psql'), [...conn, '-d', scratch, '-tAc', `SELECT count(*) FROM "${table}"`], { env }, `Comptage ${table}`)).stdout.trim());
      const users = await count('User'), torrents = await count('Torrent');
      const want = manifest.database?.counts ?? { users: 0, torrents: 0 };
      if (users !== want.users || torrents !== want.torrents) throw new Error(`Chiffres différents : ${users}/${want.users} membres, ${torrents}/${want.torrents} torrents`);
      return record(true, latest.name, `Base rechargée à part : ${users} membres et ${torrents} torrents retrouvés, comme annoncé par le paquet.`);
    } catch (e: any) {
      const res = record(false, latest.name, String(e?.message ?? e).slice(0, 300));
      if (cfg.notifyFailure) await this.notifyAdmins('❌ Test de restauration échoué', res.info);
      return res;
    } finally {
      if (created) await this.run_(bin('PSQL_BIN', 'psql'), [...conn, '-d', 'postgres', '-c', `DROP DATABASE IF EXISTS "${scratch}"`], { env }).catch(() => undefined);
      try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignoré */ }
      void p;
    }
  }

  // ------------------------------------------------------------------ zip de restauration

  /** Le script de restauration : livré avec le backend (assets/restore.sh), donc disponible même si le dossier du projet n'est pas monté. */
  private restoreScript(): Buffer | null {
    for (const p of [path.join(process.cwd(), 'assets', 'restore.sh'), path.join(__dirname, '..', '..', 'assets', 'restore.sh'), path.join(this.projectDir, 'backend', 'assets', 'restore.sh')]) {
      try { return fs.readFileSync(p); } catch { /* suivant */ }
    }
    return null;
  }

  /**
   * ZIP « prêt à remettre en ligne » : le paquet chiffré, son empreinte, le script restaurer.sh (exécutable) et un mode d'emploi pas à pas. La phrase de
   * récupération n'y est JAMAIS : sans elle, le paquet reste illisible même si le zip est perdu ou volé.
   */
  async zipPlan(name: string): Promise<{ plan: ZipPlan; filename: string }> {
    this.assertBundle(name);
    const file = path.join(this.dir, name);
    const metaFile = `${file}.json`;
    let meta: any = {};
    try { meta = JSON.parse(fs.readFileSync(metaFile, 'utf8')); } catch { /* pas de résumé */ }
    const parsed = parseBundleName(name)!;
    const script = this.restoreScript();
    if (!script) throw new BadRequestException('Le script de restauration est introuvable sur le serveur.');
    // Empreinte CRC-32 du paquet : calculée une fois, gardée dans le résumé (relire un gros fichier à chaque téléchargement serait du gaspillage).
    let known = meta.crc32 && meta.crcSize === size(file) ? { crc: meta.crc32 as number, size: meta.crcSize as number } : null;
    if (!known) {
      known = await crc32File(file);
      try { fs.writeFileSync(metaFile, JSON.stringify({ ...meta, crc32: known.crc, crcSize: known.size }, null, 2)); } catch { /* sans importance */ }
    }
    const guide = buildGuide({
      bundle: name, createdAt: meta.createdAt ?? parsed.date.toISOString(), bytes: size(file), appVersion: meta.appVersion ?? null, gitRemote: meta.git?.remote ?? null,
      users: meta.database?.counts?.users ?? null, torrents: meta.database?.counts?.torrents ?? null, partial: parsed.predeploy,
    }).replace(/\n/g, '\r\n');
    const mtime = parsed.date;
    const entries = [
      { name: `${ZIP_FOLDER}/${ZIP_GUIDE_NAME}`, data: Buffer.from(guide, 'utf8'), mtime },
      { name: `${ZIP_FOLDER}/restaurer.sh`, data: script, mtime, mode: 0o100755 },
      { name: `${ZIP_FOLDER}/${name}`, data: { file }, mtime },
    ];
    const sum = `${file}.sha256`;
    if (exists(sum)) entries.push({ name: `${ZIP_FOLDER}/${name}.sha256`, data: fs.readFileSync(sum), mtime });
    const plan = await planZip(entries, { known: { [file]: known } });
    const stamp = name.replace(/^seeduction-(backup|predeploy)-/, '').replace(/\.tar(\.enc)?$/, '');
    return { plan, filename: `seeduction-${parsed.predeploy ? 'instantane' : 'sauvegarde'}-${stamp}.zip` };
  }

  // ------------------------------------------------------------------ téléchargement et suppression

  /** Lien de téléchargement de 2 minutes (signé) : le navigateur télécharge le fichier directement. */
  async downloadLink(actor: Actor, name: string, format: 'zip' | 'raw' = 'zip', ip?: string | null) {
    this.assertBundle(name);
    const expires = Date.now() + 120_000;
    await this.audit.log(actor.userId, 'BACKUP_DOWNLOAD', { file: name, format }, ip);
    const zip = format === 'zip';
    return { url: `/api/backup/download/${encodeURIComponent(name)}?e=${expires}&s=${signDownload(zip ? `${name}|zip` : name, expires, this.secret())}${zip ? '&f=zip' : ''}` };
  }

  private secret() { return process.env.JWT_SECRET ?? 'change-me-in-.env'; }

  resolveDownload(name: string, e: string, s: string, format?: string): string {
    if (!isSafeBundleName(name) || !verifyDownload(format === 'zip' ? `${name}|zip` : name, Number(e), s, this.secret())) throw new NotFoundException();
    const file = path.join(this.dir, name);
    if (!exists(file)) throw new NotFoundException();
    return file;
  }

  async remove(actor: Actor, name: string, ip?: string | null) {
    this.assertBundle(name);
    for (const f of [name, `${name}.json`, `${name}.sha256`]) fs.rmSync(path.join(this.dir, f), { force: true });
    await this.audit.log(actor.userId, 'BACKUP_DELETE', { file: name }, ip);
    return { deleted: true };
  }

  private assertBundle(name: string) {
    if (!isSafeBundleName(name) || !exists(path.join(this.dir, name))) throw new NotFoundException('Paquet introuvable');
  }
}
