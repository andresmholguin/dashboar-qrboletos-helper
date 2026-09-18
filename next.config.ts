import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    const localBackend = process.env.LOCAL_BACKEND_URL;
    if (!localBackend) {
      return [];
    }
    return [
      {
        source: "/api/chrome/:path*",
        destination: `${localBackend}/api/chrome/:path*`,
      },
      {
        source: "/api/artworks/:path*",
        destination: `${localBackend}/api/artworks/:path*`,
      },
      {
        source: "/api/pricing/:path*",
        destination: `${localBackend}/api/pricing/:path*`,
      },
      {
        source: "/api/banners/:path*",
        destination: `${localBackend}/api/banners/:path*`,
      },
      {
        source: "/api/reports/:path*",
        destination: `${localBackend}/api/reports/:path*`,
      },
    ];
  },
  async redirects() {
    return [
      {
        source: "/versiones",
        destination: "/docs",
        permanent: false,
      },
      {
        source: "/changelog",
        destination: "/docs",
        permanent: false,
      },
      {
        source: "/reports",
        destination: "/informes",
        permanent: false,
      },
      {
        source: "/reportes",
        destination: "/informes",
        permanent: false,
      },
      {
        source: "/crm",
        destination: "/clientes",
        permanent: false,
      },
      {
        source: "/customers",
        destination: "/clientes",
        permanent: false,
      },
      {
        source: "/audiencia",
        destination: "/clientes",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
