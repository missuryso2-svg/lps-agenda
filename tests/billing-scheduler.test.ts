import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(path: string) {
  return readFileSync(join(root, path), "utf8");
}

describe("agendamento da finalização do trial", () => {
  it("declara o cron diário no vercel.json apontando para a rotina protegida", () => {
    const config = JSON.parse(read("vercel.json")) as {
      crons?: Array<{ path: string; schedule: string }>;
    };

    expect(config.crons).toContainEqual({
      path: "/api/cron/trial-finalization",
      schedule: "0 3 * * *",
    });
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

  it("documenta o agendador, o segredo e a limitação de frequência", () => {
    const readme = read("README.md");

    expect(readme).toContain("vercel.json");
    expect(readme).toContain('schedule": "0 3 * * *"');
    expect(readme).toContain("CRON_SECRET");
    expect(readme).toContain("Hobby");
    expect(readme).toContain("BILLING_CRON_SECRET");
  });
});
