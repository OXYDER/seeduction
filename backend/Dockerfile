FROM node:22-alpine AS build
RUN apk add --no-cache openssl
WORKDIR /app
COPY package.json ./
# node-datachannel (WebTorrent) télécharge un binaire précompilé depuis GitHub à l'installation ; si ce téléchargement
# expire (« prebuild-install warn install Request timed out »), son repli (compilation depuis les sources) est cassé :
# on réessaie donc quelques fois avant d'abandonner.
RUN npm install --no-audit --no-fund || (sleep 15 && npm install --no-audit --no-fund) || (sleep 45 && npm install --no-audit --no-fund)
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:22-alpine
# Outils des sauvegardes complètes (voir src/backup) : pg_dump / pg_restore / psql (client PostgreSQL 16, comme le serveur), GNU tar, rclone (copie vers un nuage ou un serveur SFTP).
RUN apk add --no-cache openssl mediainfo postgresql16-client tar rclone
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
# Logo de référence envoyé à Gemini à chaque génération d'image de nouvelle
COPY --from=build /app/assets ./assets
# Journal des modifications écrit par deploy.sh (facultatif : le joker évite l'échec s'il est absent)
COPY --from=build /app/changelog.tx[t] ./
COPY package.json ./
RUN mkdir -p /app/storage/torrents
EXPOSE 3000
# `db push` (plutôt que `migrate deploy`) car ce projet n'a pas de dossier de
# migrations versionné — il synchronise le schéma directement, sans jamais
# supprimer de données silencieusement (il refuse et log si une perte de
# données serait nécessaire, au lieu de l'appliquer).
CMD ["sh", "-c", "npx prisma db push --skip-generate && node dist/main"]
