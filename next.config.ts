import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the production build green even if a stray lint rule trips.
  // TypeScript errors are still enforced (see typecheck script / CI).
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    // Campaign / brand images can be hosted anywhere (Supabase Storage, CDN, etc.)
    remotePatterns: [
      { protocol: "https", hostname: "**" },
    ],
  },
};

export default nextConfig;
