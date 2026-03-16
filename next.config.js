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
}

module.exports = nextConfig
