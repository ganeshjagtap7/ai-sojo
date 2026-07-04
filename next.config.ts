import type { NextConfig } from "next";

// Full transitive dep tree of proxy-agent that needs to ship with the
// serverless function. apify-client requires proxy-agent via a custom
// dynamicNodeImport() that Vercel's file tracer (nft) can't follow,
// so we list every package on disk that proxy-agent (and its sub-tree)
// reaches at runtime.
const PROXY_AGENT_DEPS = [
  'proxy-agent',
  'agent-base',
  'debug',
  'ms',
  'lru-cache',
  'http-proxy-agent',
  'https-proxy-agent',
  'socks-proxy-agent',
  'socks',
  'ip-address',
  'smart-buffer',
  'pac-proxy-agent',
  'pac-resolver',
  'degenerator',
  'netmask',
  'escodegen',
  'esprima',
  'estraverse',
  'esutils',
  'es-object-atoms',
  'proxy-from-env',
  '@tootallnate/quickjs-emscripten',
];

const proxyAgentIncludes = PROXY_AGENT_DEPS.map((p) => `./node_modules/${p}/**/*`);

const nextConfig: NextConfig = {
  // apify-client uses native Node modules; leaving it unbundled at runtime
  // avoids Turbopack issues. proxy-agent is reached via dynamicNodeImport()
  // inside apify-client, so it must also be external to be require()'d
  // from disk at runtime.
  serverExternalPackages: ['apify-client', 'proxy-agent'],
  outputFileTracingIncludes: {
    '/api/search': proxyAgentIncludes,
  },
};

export default nextConfig;
