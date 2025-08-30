/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: ['kexp.org', 'kexp-prod.s3.amazonaws.com'],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'kexp.org'
      },
      {
        protocol: 'https',
        hostname: 'kexp-prod.s3.amazonaws.com'
      }
    ]
  },
  env: {
    BACKEND_URL: process.env.BACKEND_URL || 'http://localhost:3000'
  }
}

module.exports = nextConfig
