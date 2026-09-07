# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Étape 1 : compilation TypeScript
# ---------------------------------------------------------------------------
FROM node:24-bookworm-slim AS builder

WORKDIR /app

# `npm ci` exécute le script `prepare`, qui appelle husky. Dans l'image il n'y
# a ni .git ni husky (devDependency absente en prod), et l'install échouerait.
# On retire le hook du package.json de l'image plutôt que de passer
# --ignore-scripts, qui empêcherait bcrypt de récupérer son binaire natif.
COPY package.json package-lock.json ./
RUN npm pkg delete scripts.prepare && npm ci

COPY tsconfig.json ./
COPY config ./config
COPY src ./src

RUN npm run build

# ---------------------------------------------------------------------------
# Étape 2 : image d'exécution
# ---------------------------------------------------------------------------
FROM node:24-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production

# ffprobe (fourni par ffmpeg) mesure la durée des vidéos soumises pour faire
# respecter la limite de 90 s, et la valeur mesurée alimente `movie.duration`.
# Il lit la vidéo à distance sur Scaleway en HTTPS : le conteneur a donc besoin
# d'un accès réseau sortant, et de la variante Debian de ffmpeg qui embarque
# TLS. Le paquet l'installe en /usr/bin/ffprobe, chemin attendu en dur par
# MovieRequest.schema.ts et update-movie-request.ts.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm pkg delete scripts.prepare \
  && npm ci --omit=dev \
  && npm cache clean --force

COPY --from=builder /app/dist ./dist

# `tsc` ne copie que ce qu'il compile : les templates d'e-mail resteraient hors
# de dist/, et tout envoi passant par loadHtmlFile() planterait à l'exécution.
COPY src/templates ./dist/templates

# app.ts sert /uploads en statique. Tout passe désormais par S3, mais sans le
# dossier express.static logue une erreur au démarrage.
RUN mkdir -p uploads && chown -R node:node uploads

USER node

EXPOSE 5000

CMD ["node", "dist/server.js"]
