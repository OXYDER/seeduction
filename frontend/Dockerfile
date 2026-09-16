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
COPY nginx/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
