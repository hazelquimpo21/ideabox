/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Externalize pino to prevent webpack from bundling it
    // Pino uses worker threads (via thread-stream) that break when bundled
    serverComponentsExternalPackages: ['pino', 'pino-pretty'],
  },
};

export default nextConfig;
