/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/podcasts/:path*',
        destination: '/api/serve-podcast/:path*',
      },
      {
        source: '/api/serve-podcast/:path*',
        destination: '/api/serve-podcast/:path*',
      }
    ];
  },
};

module.exports = nextConfig; 