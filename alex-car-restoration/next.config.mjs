/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: { formats: ["image/avif", "image/webp"] },
  async redirects() {
    // Old single-page / early routes -> new multi-page routes
    return [
      { source: "/projects", destination: "/portfolio", permanent: true },
      { source: "/projects/:slug", destination: "/portfolio/:slug", permanent: true },
    ];
  },
};
export default nextConfig;
