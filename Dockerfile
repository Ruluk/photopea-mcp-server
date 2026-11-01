FROM node:18-slim AS build

WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
COPY src/ src/
RUN npm ci && npm run build

FROM node:18-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    firefox-esr \
    xdg-utils \
    fonts-dejavu-core \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV BROWSER=firefox-esr \
    MOZ_HEADLESS=1

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --production

COPY --from=build /app/dist/ dist/
COPY src/frontend/ src/frontend/

USER node

ENTRYPOINT ["node", "dist/index.js"]
