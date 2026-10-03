FROM node:24-bookworm-slim AS node
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM python:3.12-slim-bookworm
COPY --from=node /usr/local/bin/node /usr/local/bin/node
WORKDIR /app
COPY --from=node /app/node_modules ./node_modules
COPY package.json tsconfig.json ./
COPY services/resume-tailor ./services/resume-tailor
COPY resume-agent-inspect ./resume-agent-inspect
RUN pip install --no-cache-dir ./resume-agent-inspect
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PORT=8080
CMD ["node", "node_modules/tsx/dist/cli.mjs", "services/resume-tailor/worker.ts"]
