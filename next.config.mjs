/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Externalize pino to prevent webpack from bundling it
    // Pino uses worker threads (via thread-stream) that break when bundled
    serverComponentsExternalPackages: ['pino', 'pino-pretty'],
  },
  // Webpack configuration to address cache serialization warnings
  webpack: (config, { dev }) => {
    if (dev) {
      // Optimize filesystem cache to reduce serialization warnings
      // "Serializing big strings impacts deserialization performance"
      config.cache = {
        ...config.cache,
        type: 'filesystem',
        compression: false, // Disable compression to speed up cache operations
      };
    }
    return config;
  },
};

export default nextConfig;
