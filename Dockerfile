FROM node:24-alpine

RUN apk add --no-cache bash coreutils poppler-utils imagemagick libwebp-tools

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY server ./server
COPY public ./public
COPY scripts ./scripts
COPY pdf_extract.sh webp_convert.sh ./
RUN chmod +x pdf_extract.sh webp_convert.sh

RUN npm run build:frontend
RUN npm prune --omit=dev

ENV DATA_DIR=/data
ENV PORT=3000
EXPOSE 3000
VOLUME /data

CMD ["node", "server/index.ts"]
