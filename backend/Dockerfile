FROM node:20-alpine AS build
RUN apk add --no-cache openssl
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine
RUN apk add --no-cache openssl
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY package.json ./
RUN mkdir -p /app/storage/torrents
EXPOSE 3000
# `db push` (plutôt que `migrate deploy`) car ce projet n'a pas de dossier de
# migrations versionné — il synchronise le schéma directement, sans jamais
# supprimer de données silencieusement (il refuse et log si une perte de
# données serait nécessaire, au lieu de l'appliquer).
CMD ["sh", "-c", "npx prisma db push --skip-generate && node dist/main"]
