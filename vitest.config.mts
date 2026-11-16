import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["./tests/setup/network-guard.ts"],
    unstubGlobals: true,
    reporters: "default",
    coverage: {
      provider: "v8",
      include: [
        "src/features/billing/**/*.{ts,tsx}",
        "src/lib/asaas/**/*.{ts,tsx}",
        "src/lib/env/server.ts",
        "src/app/api/webhooks/asaas/**/*.{ts,tsx}",
        "src/app/api/cron/trial-finalization/**/*.{ts,tsx}",
        "src/app/api/cron/billing-compensation/**/*.{ts,tsx}",
      ],
      reporter: ["text", "html", "json-summary"],
      reportsDirectory: "./coverage",
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
