FROM node:20-alpine

WORKDIR /app

# Install system dependencies
RUN apk add --no-cache libc6-compat

# Copy package manifests
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy service source code
COPY . .

# Cloud Run defaults to port 8080
ENV PORT=8080
ENV NODE_ENV=production

EXPOSE 8080

CMD ["npx", "tsx", "service/server.ts"]
