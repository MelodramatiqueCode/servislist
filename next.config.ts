import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    SERVISLIST_BUILT_AT: new Date().toISOString(),
  },
};

export default nextConfig;
