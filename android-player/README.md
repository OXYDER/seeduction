# Lecteur Seeduction pour Android

Application Android (Kotlin) équivalente au lecteur Windows : un lien `seeduction://stream/<jeton>` ouvre l'application, qui échange le jeton contre le `.torrent` personnalisé du membre,
télécharge le fichier **dans l'ordre** (libtorrent), le sert à VLC par un petit serveur HTTP local (127.0.0.1, avec les demandes de zone « Range »), et signale « en train de regarder » et la position au site.

Un lien `seeduction://live/<jeton>` (bouton « Ouvrir dans le lecteur Seeduction » de la page Direct du site) ouvre `LiveActivity` : l'application échange le jeton (à usage unique) contre l'adresse du direct sur le relais et le lit dans VLC avec le son et l'image d'origine, choix de la piste audio, nouvelles tentatives automatiques si le relais démarre ou coupe un instant.

- **Moteur BitTorrent** : libtorrent4j (arm64 et arm 32 bits). Un service au premier plan (notification discrète) garde le téléchargement et le seed actifs écran éteint ; le partage reprend après un redémarrage.
- **Lecture** : libVLC (tous les formats, pistes audio, sous-titres, y compris les sous-titres partagés sur le site). Double-tape à gauche / droite : ±10 s ; au centre : pause.
- **Règles du site** : l'obligation de partage (72 h ou ratio 1) est affichée ; le partage se met en pause sur données mobiles (réglage « Wi-Fi seulement »).
- **Reprise** : locale et aussi par le site (`GET /api/stream/resume`, identifié par la passkey), donc elle suit le membre d'un appareil à l'autre.

## Construire l'APK

Il faut Android Studio (ou le SDK Android 34 et un JDK 17+) ; rien d'autre n'est à installer, Gradle télécharge le reste.

```bash
cd android-player
# Windows (Git Bash) : JAVA_HOME doit pointer vers un JDK 17 à 21, par exemple celui d'Android Studio
export JAVA_HOME="/c/Program Files/Android/Android Studio/jbr"
./gradlew assembleRelease
```

L'APK signé est `app/build/outputs/apk/release/app-release.apk` (environ 57 Mo). À publier sur le site : **Admin > Lecteurs** (choisir le fichier, indiquer la version, « Publier »). L'application compare sa version
(`versionName` dans `app/build.gradle.kts`) à celle du site et propose le téléchargement ; **augmenter `versionName` et `versionCode` avant chaque compilation**
(sinon Android refuse d'installer par-dessus). `tools/publier-lecteurs.bat` fait tout cela automatiquement (version suivante, compilation, publication, vérification) ;
voir `desktop-player/README.md`.

## Signature

Le coffre de clés et ses mots de passe ne sont **jamais** dans le dépôt : `keystore.properties` (ignoré par git) contient `storeFile`, `storePassword`, `keyAlias`, `keyPassword`
(ou les variables d'environnement `SEEDUCTION_KEYSTORE`, `SEEDUCTION_KEYSTORE_PASSWORD`, `SEEDUCTION_KEY_ALIAS`, `SEEDUCTION_KEY_PASSWORD`).
**Garde une copie du coffre** (`seeduction.jks`) : une mise à jour de l'application doit être signée avec la même clé, sinon Android refuse de l'installer par-dessus l'ancienne version.
Sans coffre, la version « release » se signe avec la clé de débogage (utile pour essayer, pas pour distribuer).

## Essais

```bash
./gradlew testDebugUnitTest
```

Les essais font tourner le vrai moteur (libtorrent pour Windows) contre un seeder local : lecture au milieu et à la fin d'un fichier de 8 Mo partagé, serveur HTTP avec « Range », tampon de départ.
Ils ne remplacent pas un essai sur un téléphone (VLC, notifications, ouverture du lien depuis le navigateur).

## Limites actuelles

- Pas de version iOS.
- Pas de mise à jour automatique : une nouvelle version se télécharge et s'installe à la main.
- Une seule lecture à l'écran à la fois (plusieurs partages peuvent tourner en arrière-plan).
- Non distribuée sur le Play Store : « Sources inconnues » à autoriser à l'installation.
