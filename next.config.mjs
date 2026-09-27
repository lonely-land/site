/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    formats: ['image/avif', 'image/webp'],
  },
  async headers() {
    return [
      {
        // 图标资源：缓存 3 天
        // （图片已托管到 R2（land.c0ffee.space），仓库里不再有 /images 资源）
        source: '/icons/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=259200',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
