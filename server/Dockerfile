FROM node:20-alpine

WORKDIR /app

COPY server/package.json /app/server/package.json
WORKDIR /app/server
RUN npm install --omit=dev

WORKDIR /app
COPY server/ /app/server/
COPY public/ /app/public/

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

WORKDIR /app/server
CMD ["node", "index.js"]
