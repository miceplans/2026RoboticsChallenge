import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Docker 배포용: 필요한 파일만 .next/standalone 에 모은다
  output: 'standalone',
};

export default nextConfig;
