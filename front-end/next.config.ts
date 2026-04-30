import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// next-intl plugin — points at the request-config file so the server knows
// where to look up the active locale + messages bundle for each request.
const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  // Allow next/image to optimize images served from Cloudinary (where chat
  // attachments, avatars, portfolio shots, and license documents all live).
  // The custom loader in lib/cloudinary-loader.ts adds f_auto/q_auto/width
  // transformations to each request, so the browser gets the smallest
  // suitable format and resolution instead of the full-size original.
  //
  // Non-Cloudinary remote URLs aren't whitelisted here on purpose — components
  // that may render arbitrary external URLs use plain <img> as a graceful
  // fallback.
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
        pathname: "/**",
      },
    ],
  },
};

export default withNextIntl(nextConfig);
