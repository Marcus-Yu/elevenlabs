# Atlas watcher box for Maritime's custom container contract. No npm dependencies.
FROM node:24-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json server.mjs watcher.mjs ./
ENV NODE_ENV=production
# Exec form, no shell string: Maritime's micro-VM init flattens shell-string CMDs.
CMD ["node", "server.mjs"]
