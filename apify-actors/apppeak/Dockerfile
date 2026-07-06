# This base image already ships the Apify SDK + Playwright + a matching Chromium.
# We deliberately do NOT run a bare `npm install` — that would prune the
# preinstalled playwright. Copying the source and relying on the preinstalled
# packages guarantees the library and browser versions always match.
FROM apify/actor-node-playwright-chrome:22

COPY --chown=myuser . ./

# Base image's default CMD runs `npm start` (→ node src/main.js).
