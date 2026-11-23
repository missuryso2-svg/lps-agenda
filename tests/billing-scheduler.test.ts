import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(path: string) {
  return readFileSync(join(root, path), "utf8");
}

describe("segurança operacional do deployment Vercel", () => {
  it("mantém Git deployments e cron financeiro desligados por padrão", () => {
    const config = JSON.parse(read("vercel.json")) as {
      crons?: Array<{ path: string; schedule: string }>;
      git?: { deploymentEnabled?: boolean };
      regions?: string[];
    };

    expect(config.git?.deploymentEnabled).toBe(false);
    expect(config.regions).toEqual(["iad1"]);
    expect(config.crons ?? []).toEqual([]);
  });

  it("expõe GET e POST no route handler, com runtime Node e sem cache", () => {
    const route = read("src/app/api/cron/trial-finalization/route.ts");

    expect(route).toContain('export const runtime = "nodejs"');
    expect(route).toContain('export const dynamic = "force-dynamic"');
    expect(route).toContain("export const maxDuration = 60");
    expect(route).toContain("export async function GET");
    expect(route).toContain("export async function POST");
    expect(route).toContain("verifyBillingCronRequest");
    expect(route).toContain('"Cache-Control": "no-store"');
  });

  it("documenta a rotina legada sem agendamento automático", () => {
    const readme = read("README.md");

    expect(readme).toContain("vercel.json");
    expect(readme).toContain("não há agendamento automático configurado");
    expect(readme).not.toContain('schedule": "0 3 * * *"');
    expect(readme).toContain("CRON_SECRET");
    expect(readme).toContain("BILLING_CRON_SECRET");
  });
});
