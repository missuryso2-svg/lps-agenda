import { describe, expect, it } from "vitest";
import { monthlyAnchorDate } from "@/features/billing/manual-calendar";

describe("datas civis do contrato mensal", () => {
  it.each([
    ["2026-01", 31, "2026-01-31"],
    ["2026-02", 31, "2026-02-28"],
    ["2026-03", 31, "2026-03-31"],
    ["2026-02", 30, "2026-02-28"],
    ["2028-02", 30, "2028-02-29"],
    ["2100-02", 29, "2100-02-28"],
    ["2000-02", 29, "2000-02-29"],
    ["2026-04", 31, "2026-04-30"],
  ] as const)("%s com âncora %i", (month, anchor, expected) => {
    expect(monthlyAnchorDate(month, anchor)).toBe(expected);
  });

  it.each(["0000-01", "2026-00", "2026-13", "2026-2", "2026-02-28"])(
    "rejeita competência %s", (month) => {
      expect(() => monthlyAnchorDate(month, 1)).toThrow(RangeError);
    },
  );
  it.each([0, 32, 1.5, NaN])("rejeita âncora %i", (day) => {
    expect(() => monthlyAnchorDate("2026-02", day)).toThrow(RangeError);
  });
});
