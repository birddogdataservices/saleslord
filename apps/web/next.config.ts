import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@saleslord/core", "@saleslord/signals"],
};

export default nextConfig;
