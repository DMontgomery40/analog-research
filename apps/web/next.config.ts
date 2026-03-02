import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  transpilePackages: ['@analogresearch/ui', '@analogresearch/database', 'analogresearch-mcp'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
    ],
  },
}

export default nextConfig
