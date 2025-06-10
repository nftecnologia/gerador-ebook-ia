/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['@sparticuz/chromium', 'puppeteer-core']
  },
  webpack: (config) => {
    config.resolve.alias.canvas = false;
    config.externals.push({
      'utf-8-validate': 'commonjs utf-8-validate',
      'bufferutil': 'commonjs bufferutil',
    });
    return config;
  },
  env: {
    // Fallback values para desenvolvimento
    DATABASE_URL: process.env.DATABASE_URL || '',
    REDIS_URL: process.env.REDIS_URL || '',
    OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
  }
}

export default nextConfig
