FROM node:22-bookworm-slim AS build

WORKDIR /app

ARG APP_VERSION

COPY package.json package-lock.json* ./
RUN npm install

COPY . .
ENV APP_VERSION=$APP_VERSION
RUN npm run build

FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY --from=build /app/dist ./dist
COPY --from=build /app/build ./build
COPY --from=build /app/server/migrations ./build/server/migrations
RUN mkdir -p /data

ENV NODE_ENV=production
ENV PORT=4287
ENV HOST=0.0.0.0
ENV DB_PATH=/data/piggy-bank.sqlite
ENV UPLOAD_DIR=/data/uploads

EXPOSE 4287

CMD ["node", "build/server/index.js"]
