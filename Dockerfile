FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/

# Install ALL deps (including dev) for the build stage
RUN npm install --legacy-peer-deps
RUN npx prisma generate

COPY . .
RUN npm run build

# Verify build output exists
RUN ls -la dist/main.js

FROM node:20-alpine AS runner

WORKDIR /app

# Only install production deps for the final image
COPY package*.json ./
RUN npm install --legacy-peer-deps --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/prisma ./prisma

EXPOSE 3000

CMD ["node", "dist/main"]
