FROM node:26-bookworm-slim
ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_CACHE_DIR=/ms-chrome \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci && npx playwright install --with-deps chromium && npx puppeteer browsers install chrome && npm cache clean --force \
    && apt-get update && apt-get install -y --no-install-recommends xvfb xauth \
    && rm -rf /var/lib/apt/lists/*
COPY tsconfig.json ./
COPY projects/lib ./projects/lib
COPY projects/common ./projects/common
COPY projects/data-parser ./projects/data-parser
RUN mkdir -p /app/tmp /reports && chown -R node:node /app /reports
ENV PARSER_LOCK_PATH=/reports/weekly-sync.lock PARSER_HEADLESS=false
USER node
ENTRYPOINT ["xvfb-run", "-a"]
CMD ["npm", "run", "parser:weekly", "--", "--report=/reports/latest.json"]
