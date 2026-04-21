FROM node:22-slim
WORKDIR /app
COPY package.json .
RUN npm install
COPY server.js .
EXPOSE 4444
CMD ["node", "server.js"]
