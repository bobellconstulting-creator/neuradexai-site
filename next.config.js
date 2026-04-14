/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: [],
  },
  experimental: {
    webpackBuildWorker: false,
    workerThreads: true,
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      // playwright and patchright are local-only tools — they can't run on Vercel serverless.
      // Mark as externals so webpack doesn't bundle them. Tool calls that require them will
      // return BLOCKED errors gracefully on Vercel, which is the expected behavior.
      const existing = Array.isArray(config.externals) ? config.externals : []
      config.externals = [...existing, 'playwright', 'patchright', '@playwright/test']
    }
    return config
  },
}

module.exports = nextConfig
