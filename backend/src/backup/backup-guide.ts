// Mode d'emploi placé dans le ZIP de restauration (à côté du paquet chiffré et du script restaurer.sh) : écrit pour quelqu'un qui n'a RIEN d'autre que ce dossier,
// peut-être des mois plus tard, sur une machine neuve.

import { formatBytes } from './backup-utils';

export interface GuideInfo {
  bundle: string;
  createdAt: string;
  bytes: number;
  appVersion?: string | null;
  gitRemote?: string | null;
  users?: number | null;
  torrents?: number | null;
  /** Le zip ne contient que la base (instantané avant mise à jour) : pas de fichiers ni de code. */
  partial?: boolean;
}

export const ZIP_FOLDER = 'seeduction-restauration';
export const ZIP_GUIDE_NAME = '1-LISEZ-MOI-D-ABORD.txt';

export function buildGuide(i: GuideInfo): string {
  const date = new Date(i.createdAt).toLocaleString('fr-CA', { dateStyle: 'full', timeStyle: 'short', timeZone: 'America/Toronto' });
  const L: string[] = [];
  const add = (...lines: string[]) => L.push(...lines);
  add(
    'SEEDUCTION — REMETTRE LE SITE EN LIGNE À PARTIR DE CETTE SAUVEGARDE',
    '====================================================================',
    '',
    `Sauvegarde du : ${date}`,
    `Version du site : ${i.appVersion ?? 'inconnue'}${i.users != null ? `   ·   ${i.users} membres, ${i.torrents ?? '?'} torrents` : ''}`,
    `Taille du paquet : ${formatBytes(i.bytes)}`,
  );
  if (i.partial) add('', "ATTENTION : c'est un instantané « avant mise à jour » : il contient la base de données et la configuration, mais PAS les fichiers (.torrent, pochettes...) ni le code. Pour une remise en ligne complète, prends plutôt une sauvegarde complète.");
  add(
    '',
    'CE QUE CONTIENT CE DOSSIER',
    '--------------------------',
    '  1-LISEZ-MOI-D-ABORD.txt      ce mode d\'emploi',
    '  restaurer.sh                 le script qui fait tout le travail',
    `  ${i.bundle}`,
    '                               la sauvegarde complète, CHIFFRÉE : base de données, fichiers, configuration et secrets (.env), code',
    `  ${i.bundle}.sha256`,
    '                               l\'empreinte du paquet, pour vérifier qu\'il n\'est pas abîmé',
    '',
    'CE QU\'IL TE FAUT AVANT DE COMMENCER',
    '-----------------------------------',
    '  1. LA PHRASE DE RÉCUPÉRATION (ex. K7QM2-X9PTR-4HBNC-…).',
    '     Elle n\'est volontairement PAS dans ce dossier : sans elle, personne ne peut lire la sauvegarde (elle contient les mots de passe et les clés du site).',
    '     Tu la retrouves dans Admin > Sauvegardes > « Afficher la phrase de récupération » — si le site est perdu, c\'est la copie que tu as notée',
    '     ailleurs (gestionnaire de mots de passe, papier dans un coffre) qui sert. Si tu ne l\'as pas, il n\'y a aucun moyen de la retrouver.',
    '  2. Une machine : un serveur Linux (VPS, hébergeur), un NAS (Synology...), ou un PC.',
    '     Conseillé : 2 Go de mémoire, 2 cœurs, 20 Go de disque libres + la place des données du site.',
    '  3. Docker (le script peut l\'installer tout seul sous Linux : voir l\'étape 3).',
    '  4. Internet pour télécharger Docker, ses images et le code (sauf installation hors ligne, voir plus bas).',
    '',
    'LES ÉTAPES — Linux, serveur loué, hébergeur',
    '-------------------------------------------',
    '  1. Connecte-toi à la machine en SSH (ou ouvre un terminal dessus).',
    '  2. Copie ce dossier sur la machine (scp, WinSCP, FileZilla, clé USB...) puis place-toi dedans :',
    '         unzip seeduction-sauvegarde-*.zip',
    `         cd ${ZIP_FOLDER}`,
    '  3. Lance le script :',
    '         bash restaurer.sh --installer-docker',
    '     (retire --installer-docker si Docker est déjà installé ; sous Linux, utilise « sudo » devant si le script se plaint des droits).',
    '  4. Le script te demande la phrase de récupération, vérifie que le paquet est intact, te demande de confirmer,',
    '     puis remet tout en place : code, configuration, base de données, fichiers. Compte 5 à 15 minutes.',
    '  5. Quand il écrit « Terminé », le site répond sur  http://ADRESSE-DE-LA-MACHINE:9098  (et le tracker sur le port 9099).',
    '  6. Termine par les 3 réglages que le script ne peut pas faire à ta place (voir « APRÈS LA RESTAURATION »).',
    '',
    'SYNOLOGY (NAS)',
    '--------------',
    '  • Installe « Container Manager » depuis le Centre de paquets, et active SSH (Panneau de configuration > Terminal et SNMP).',
    '  • Connecte-toi en SSH, passe administrateur (sudo -i), copie ce dossier dans /volume1/docker/ puis :  bash restaurer.sh',
    '',
    'WINDOWS',
    '-------',
    '  • Le plus fiable : installe WSL2 avec Ubuntu (« wsl --install » dans PowerShell) et Docker Desktop (option « intégration WSL »).',
    '  • Ouvre Ubuntu, copie ce dossier dans ton dossier personnel Ubuntu (pas dans /mnt/c), puis suis les étapes Linux ci-dessus.',
    '',
    'MAC',
    '---',
    '  • Installe Docker Desktop, ouvre le Terminal, place-toi dans ce dossier et lance :  bash restaurer.sh',
    '',
    'JUSTE VÉRIFIER QUE LA SAUVEGARDE EST BONNE (sans rien installer)',
    '--------------------------------------------------------------',
    '         bash restaurer.sh --verifier',
    '',
    'APRÈS LA RESTAURATION — 3 RÉGLAGES À FAIRE TOI-MÊME',
    '---------------------------------------------------',
    '  1. Le proxy (Nginx Proxy Manager, Caddy, Traefik...) : le site (ton nom de domaine) doit pointer vers cette machine, port 9098 ;',
    '     le tracker (ex. venus.ton-domaine) vers le port 9099 ; avec le certificat HTTPS.',
    '  2. Le DNS chez ton registraire : l\'enregistrement A (et AAAA) de ton domaine doit désigner l\'adresse publique de la nouvelle machine.',
    '  3. Facultatif — appels audio/vidéo : rouvrir les ports TURN (3478, et 49160 à 49200 en UDP) vers cette machine.',
    '',
    '  Ensuite : connecte-toi avec ton compte habituel. Les mots de passe, les passkeys des membres (donc leurs clients torrent) et le JWT_SECRET',
    '  sont ceux d\'avant : personne n\'a rien à refaire. Pense à relancer une sauvegarde depuis Admin > Sauvegardes sur la nouvelle machine,',
    '  et à y renseigner de nouveau ta copie hors du serveur.',
    '',
    'INSTALLATION SANS INTERNET (facultatif)',
    '---------------------------------------',
    '  Sur une machine qui a le site, « docker compose build » puis « ./backup.sh --images » enregistre les images dans backups/images/.',
    '  Copie ce fichier ici et lance :  bash restaurer.sh --images seeduction-images.tar',
    '',
    'SI QUELQUE CHOSE NE VA PAS',
    '--------------------------',
    '  • « Phrase incorrecte » : recopie-la sans espace ni confusion (la phrase n\'utilise ni 0, ni O, ni 1, ni I) ; elle est la même pour toutes les sauvegardes de ce site.',
    '  • « L\'empreinte ne correspond pas » : le fichier est abîmé pendant la copie ; recopie-le (ou retélécharge le zip).',
    '  • « Docker ne répond pas » : démarre Docker ; sous Linux essaie avec sudo ; vérifie l\'espace disque (df -h).',
    '  • Le site ne répond pas après « Terminé » : attends 1 minute puis  docker compose logs --tail=80 backend  (dans le dossier seeduction).',
    '  • Un port est déjà pris (9098, 9099) : arrête ce qui l\'occupe, ou change les ports dans docker-compose.yml.',
    '  • Tu veux repartir de zéro : « docker compose down -v » dans le dossier seeduction efface les données, puis relance le script.',
    '',
    'Informations techniques : BACKUP.md dans le dossier seeduction installé (ou dans le dépôt du site).',
  );
  if (i.gitRemote) add('', `Dépôt du code utilisé pour la restauration : ${i.gitRemote} (si inaccessible, le script utilise la copie du code contenue dans le paquet).`);
  return L.join('\n') + '\n';
}
