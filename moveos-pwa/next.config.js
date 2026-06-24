const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
  runtimeCaching: [
    {
      urlPattern: /^https:\/\/fonts\.googleapis\.com/,
      handler: 'CacheFirst',
      options: {
        cacheName: 'google-fonts',
        expiration: {
          maxEntries: 4,
          maxAgeSeconds: 365 * 24 * 60 * 60,
        },
      },
    },
    {
      urlPattern: /\/api\/routes$/,
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'routes-cache',
        expiration: {
          maxEntries: 1,
          maxAgeSeconds: 60 * 60,
        },
      },
    },
    {
      urlPattern: /\/api\/trips\/available/,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'trips-cache',
        networkTimeoutSeconds: 5,
        expiration: {
          maxEntries: 20,
          maxAgeSeconds: 4 * 60 * 60,
        },
      },
    },
  ],
});

module.exports = withPWA({
  reactStrictMode: true,
  distDir: process.env.NODE_ENV === 'production' ? '.next-prod' : '.next',
});
