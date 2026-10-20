FROM node:22-alpine
WORKDIR /app
COPY package.json server.mjs ./
RUN mkdir -p /app/data && chown -R node:node /app
USER node
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4320 CELINO_DATA_DIR=/app/data
EXPOSE 4320
CMD ["node", "server.mjs"]
