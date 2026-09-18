import type { NextConfig } from "next";
import path from "path";
import { fileURLToPath } from "url";

const marketingRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // Pin package root so Turbopack does not treat src/app as the project.
  turbopack: {
    root: marketingRoot,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            // Without this, a browser that has never seen the site will speak
            // HTTP first. After a successful HTTPS visit, HSTS forces HTTPS.
            // preload is omitted until the domain is submitted to hstspreload.org.
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
