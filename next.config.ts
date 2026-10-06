import type { NextConfig } from "next";
import { isSelfHosted, parseConfiguredOrigin } from './src/lib/runtime-env';

// Next serializes image configuration at build time: rebuild when this origin changes.
// Do not enable dangerouslyAllowLocalIP; local avatars use the controlled storage URL.
const publicStorageOrigin = isSelfHosted()
  ? parseConfiguredOrigin(process.env.SUPABASE_PUBLIC_URL, 'SUPABASE_PUBLIC_URL')
  : new URL('https://gdaaipkdmwxkvgesknsp.supabase.co');

const nextConfig: NextConfig = {
  output: 'standalone',
  images: {
    remotePatterns: [
      {
        protocol: publicStorageOrigin.protocol.slice(0, -1) as 'http' | 'https',
        hostname: publicStorageOrigin.hostname,
        port: publicStorageOrigin.port,
        pathname: '/storage/v1/object/public/**',
      },
      {
        protocol: 'https',
        hostname: 'connect.linux.do',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'linux.do',
        port: '',
        pathname: '/**',
      },
    ],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
