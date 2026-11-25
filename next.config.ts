import type { NextConfig } from "next";
import { baselineCsp } from "./src/lib/security/csp";

const securityHeaders = [
  { key: "Content-Security-Policy", value: baselineCsp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

if (process.env.NODE_ENV === "production") {
  securityHeaders.push({
    key: "Strict-Transport-Security",
    value: "max-age=31536000",
  });
}

const isDevelopment = process.env.NODE_ENV === "development";

function readTunnelHost(): string | undefined {
  const value = process.env.CLOUDFLARE_TUNNEL_HOST?.trim().toLowerCase();

  if (
    !value ||
    value.includes("*") ||
    value.includes("/") ||
    value.includes(":")
  ) {
    return undefined;
  }

  return value;
}

const tunnelHost = readTunnelHost();
const devTunnelOrigins =
  isDevelopment && tunnelHost ? [tunnelHost] : undefined;

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  ...(devTunnelOrigins ? { allowedDevOrigins: devTunnelOrigins } : {}),
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  ...(devTunnelOrigins
    ? {
        experimental: {
          serverActions: {
            allowedOrigins: devTunnelOrigins,
          },
        },
      }
    : {}),
};

export default nextConfig;
