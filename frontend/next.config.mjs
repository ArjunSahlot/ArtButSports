/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "openaccess-cdn.clevelandart.org" },
      { protocol: "http", hostname: "localhost" }
    ]
  }
};

export default nextConfig;

