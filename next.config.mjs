import { montarFrameAncestors } from './lib/frame-ancestors.mjs';

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
        ],
      },
      {
        // Páginas: anti-clickjacking. /api fica de fora para não sobrescrever o CSP próprio
        // das rotas (ex.: /api/auditoria-relatorio devolve `default-src 'none'`).
        source: '/((?!data/|api/).*)',
        headers: [
          { key: 'Content-Security-Policy', value: `frame-ancestors ${montarFrameAncestors()}` },
        ],
      },
      {
        source: '/data/:path*',
        has: [
          { type: 'query', key: 'v' }
        ],
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        source: '/data/:path*',
        missing: [
          { type: 'query', key: 'v' }
        ],
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
        ],
      },
      {
        source: '/data/meta.json',
        headers: [
          { key: 'Cache-Control', value: 'no-cache' },
        ],
      }
    ];
  },
};
export default nextConfig;
