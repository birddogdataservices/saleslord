import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// next-intl in no-i18n-routing mode — locale comes from a cookie (mirror of
// rep_profiles.locale), not a URL segment. The plugin auto-discovers the request
// config at ./i18n/request.ts.
const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  transpilePackages: ["@saleslord/core", "@saleslord/signals"],
};

export default withNextIntl(nextConfig);
