/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // aceita o host de preview do ambiente (porta-*.dominio)
  allowedDevOrigins: ['*.e2b.app', 'localhost', '127.0.0.1'],
  async headers() {
    return [
      {
        source: '/((?!data/).*)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
          { key: 'X-Frame-Options', value: 'ALLOWALL' },
        ],
      },
      {
        source: '/data/:path*',
        has: [
          { type: 'query', key: 'v' }
        ],
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
          { key: 'X-Frame-Options', value: 'ALLOWALL' }
        ],
      },
      {
        source: '/data/:path*',
        missing: [
          { type: 'query', key: 'v' }
        ],
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
          { key: 'X-Frame-Options', value: 'ALLOWALL' }
        ],
      },
      {
        source: '/data/meta.json',
        headers: [
          { key: 'Cache-Control', value: 'no-cache' },
          { key: 'X-Frame-Options', value: 'ALLOWALL' }
        ],
      }
    ];
  },
};
export default nextConfig;
