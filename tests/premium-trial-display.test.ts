import { describe, expect, it } from "vitest";
import { automaticTrialDisplay, expiredTrialMessage } from "@/features/premium-trial/display";

const trial = {
  started_at: "2026-11-26T16:00:00Z",
  ends_at: "2026-12-03T16:00:00Z",
  observed_at: "2026-11-26T16:00:00Z",
  running: true,
  welcome_available: true,
};
const day = 86_400_000;
const zone = "America/Sao_Paulo";

describe("automatic Premium trial presentation", () => {
  it.each([
    [0, 7, "Você ainda tem 7 dias grátis."],
    [4 * day, 3, "Você ainda tem 3 dias grátis."],
    [6 * day, 1, "Você ainda tem 1 dia grátis."],
    [7 * day - 1, 1, "Hoje é o último dia do seu período grátis."],
  ])("uses whole remaining days without rounding a valid trial to zero", (elapsed, daysLeft, message) => {
    expect(automaticTrialDisplay(trial, zone, elapsed)).toMatchObject({
      daysLeft, message, expired: false, endsOn: "3 de dezembro de 2026",
    });
  });

  it("marks the exact millisecond and later as expired", () => {
    for (const elapsed of [7 * day, 7 * day + 1]) {
      expect(automaticTrialDisplay(trial, zone, elapsed)).toMatchObject({
        message: expiredTrialMessage, daysLeft: 0, expired: true, progress: 100,
      });
    }
  });

  it("uses the server clock snapshot and clamps progress while running", () => {
    expect(automaticTrialDisplay(trial, zone, -100).progress).toBe(0);
    expect(automaticTrialDisplay(trial, zone, 7 * day - 1).progress).toBe(99);
  });
});
