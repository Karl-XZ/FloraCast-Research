FROM node:20-slim

WORKDIR /app

COPY server/package*.json ./server/
RUN cd server && npm ci --omit=dev

COPY public ./public
COPY server ./server
COPY README.md LICENSE .env.example ./

ENV NODE_ENV=production
ENV PORT=7860
EXPOSE 7860

CMD ["npm", "--prefix", "server", "start"]
