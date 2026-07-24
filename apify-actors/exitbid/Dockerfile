# This base image already ships the Apify SDK + Playwright + a matching Chromium.
# We deliberately do NOT run a bare `npm install` — that reconciles node_modules
# to our package.json and PRUNES the preinstalled playwright (the earlier bug:
# "removed 149 packages" → "Cannot find package 'playwright'"). Copying the source
# and relying on the preinstalled packages is the robust approach and guarantees
# the Playwright library and browser versions always match.
FROM apify/actor-node-playwright-chrome:22

COPY --chown=myuser . ./

# Base image's default CMD runs `npm start` (→ node src/main.js).
