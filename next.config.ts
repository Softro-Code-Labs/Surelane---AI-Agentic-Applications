import type { NextConfig } from 'next';

const dev = process.env.NODE_ENV !== 'production';
const csp = [
  "default-src 'self'", `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ''}`, "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:", "font-src 'self' data:", "frame-src 'self'", "object-src 'self'", "frame-ancestors 'self'", "base-uri 'self'", "form-action 'self'",
].join('; ');

const config: NextConfig = {
  serverExternalPackages: ['pg', 'unpdf', 'mammoth'],
  poweredByHeader: false,
  async headers() {
    // The CV preview route sets its own, stricter policy.
    return [
      { source: '/((?!api/cv/file).*)', headers: [
        { key: 'Content-Security-Policy', value: csp }, { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' }, { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
        // Browsers ignore this over plain http, so local development is unaffected.
        { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
      ] },
      // Everything under /api is private to the signed-in owner. Nothing in between may keep a copy.
      { source: '/api/:path*', headers: [{ key: 'Cache-Control', value: 'private, no-store' }] },
    ];
  },
};
export default config;
