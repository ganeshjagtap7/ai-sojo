import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // apify-client uses native Node modules (HTTP agents, etc.) — leaving it
  // unbundled at runtime avoids Turbopack issues. proxy-agent is reached via
  // a dynamicNodeImport() inside apify-client, which Vercel's file tracer
  // can't follow statically, so we declare it explicitly here so the deploy
  // ships it with the function.
  serverExternalPackages: ['apify-client', 'proxy-agent'],
  outputFileTracingIncludes: {
    // Force-include proxy-agent (and its transitive proxy implementations)
    // for any route that may invoke the Apify pipeline.
    '/api/search': ['./node_modules/proxy-agent/**/*', './node_modules/{http,https,socks,pac}-proxy-agent/**/*'],
    '/api/search/[jobId]/status': ['./node_modules/proxy-agent/**/*', './node_modules/{http,https,socks,pac}-proxy-agent/**/*'],
    '/api/search/[jobId]/results': ['./node_modules/proxy-agent/**/*', './node_modules/{http,https,socks,pac}-proxy-agent/**/*'],
  },
};

export default nextConfig;
