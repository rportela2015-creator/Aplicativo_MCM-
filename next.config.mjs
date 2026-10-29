/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // aceita o host de preview do ambiente (porta-*.dominio)
  allowedDevOrigins: ['*.e2b.app', 'localhost', '127.0.0.1'],
  async headers() {
    return [
      {
        source: '/data/meta.json',
        headers: [
          { key: 'Cache-Control', value: 'no-cache' }
        ],
      },
      {
        source: '/data/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }
        ],
      },
      {
        source: '/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
          { key: 'X-Frame-Options', value: 'ALLOWALL' },
        ],
      }
    ];
  },
};
export default nextConfig;
