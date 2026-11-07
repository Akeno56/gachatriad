import type { NextConfig } from 'next';
const config: NextConfig = {
  ...(process.env.STATIC_EXPORT === 'true' ? { output: 'export', trailingSlash: true } : {}),
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || '',
  env: {
    NEXT_PUBLIC_STATIC_EXPORT: process.env.STATIC_EXPORT === 'true' ? 'true' : 'false',
    NEXT_PUBLIC_BASE_PATH: process.env.NEXT_PUBLIC_BASE_PATH || '',
  },
  transpilePackages: ['@gacha-triad/engine', '@gacha-triad/shared'],
  devIndicators: false,
  ...(process.env.STATIC_EXPORT === 'true'
    ? {}
    : {
        async rewrites() {
          return [
            {
              source: '/api/:path*',
              destination: `${process.env.SERVER_URL || 'http://127.0.0.1:3001'}/api/:path*`,
            },
          ];
        },
      }),
};
export default config;
