import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  transpilePackages: ['@analoglabor/ui', '@analoglabor/database', 'analoglabor-mcp'],
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
