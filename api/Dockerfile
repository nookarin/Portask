FROM node:22-alpine AS base
WORKDIR /app
COPY package*.json ./

FROM base AS deps
RUN npm ci

FROM base AS dev
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
EXPOSE 5000
CMD ["npm", "run", "dev"]

FROM deps AS build
COPY . .
RUN npx prisma generate && npm run build
RUN npm prune --omit=dev
ENV NODE_ENV=production
EXPOSE 5000
CMD ["node", "dist/index.js"]