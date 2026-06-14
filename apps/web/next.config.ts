import type { NextConfig } from 'next';

/**
 * The dashboard is served by NestJS via `next().getRequestHandler()` (single process, port 3001).
 * `output: 'standalone'` is a T17 Docker-image size optimization; the custom-server embed itself
 * just needs the regular `.next` build.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
