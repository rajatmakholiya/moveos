/** @type {import('next').NextConfig} */
const nextConfig = {
  ...(process.env.NODE_ENV === 'production' ? { output: 'export' } : {}),
  distDir: process.env.NODE_ENV === 'production' ? '.next-prod' : '.next',
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: { unoptimized: true },
  webpack: (config) => {
    // socket.io-client pulls in `ws`, whose optional native deps aren't needed
    // in the browser (it uses the native WebSocket). Stub them to avoid warnings.
    config.resolve.fallback = {
      ...config.resolve.fallback,
      'utf-8-validate': false,
      bufferutil: false,
    };
    return config;
  },
};

module.exports = nextConfig;
