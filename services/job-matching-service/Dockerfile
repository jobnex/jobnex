FROM node:20-alpine

WORKDIR /app

# Install system dependencies
RUN apk add --no-cache libc6-compat

# Copy package manifests and set ownership
COPY package*.json ./

# Install dependencies strictly from lockfile
RUN npm ci

# Copy service source code and chown to unprivileged node user
COPY --chown=node:node . .

# Set execution user to unprivileged non-root user (CIS Docker Benchmark 4.1)
USER node

# Cloud Run defaults to port 8080
ENV PORT=8080
ENV NODE_ENV=production

EXPOSE 8080

CMD ["npx", "tsx", "service/server.ts"]
