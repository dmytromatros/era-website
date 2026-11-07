import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // The site is fully static (content lives in /content), so `/` just points at the default locale.
  async redirects() {
    return [{ source: '/', destination: '/en', permanent: false }]
  },
}

export default nextConfig
