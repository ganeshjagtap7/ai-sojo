# Base image ships Apify SDK + Playwright + Chromium. Do NOT run a bare
# `npm install` (it prunes the preinstalled playwright). Just copy source.
FROM apify/actor-node-playwright-chrome:22

COPY --chown=myuser . ./
