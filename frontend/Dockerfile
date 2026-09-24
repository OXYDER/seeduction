FROM node:20-alpine AS build
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
# Le build Vite recrée parfois les assets copiés depuis public/ avec un
# umask restrictif (600, root:root) — illisibles par le worker nginx
# (non-root), d'où des 403 aléatoires sur certains fichiers statiques.
RUN chmod -R a+rX /usr/share/nginx/html
# Configuration générée au démarrage : nginx remplace ${TRACKER_HOST} (et seulement les variables
# TRACKER_*) dans le modèle. Valeur par défaut ci-dessous, surchargée par docker-compose.yml.
ENV TRACKER_HOST=tracker.invalid     NGINX_ENVSUBST_FILTER=^TRACKER_
COPY nginx/site.conf.template /etc/nginx/templates/default.conf.template
COPY nginx/tracker-location.conf /etc/nginx/snippets/tracker-location.conf
EXPOSE 80 8081
