import { describe, expect, it, vi } from "vitest";

import { FakeSupabase, type FakeRow } from "./helpers/fake-supabase";

vi.mock("server-only", () => ({}));

import { getBarbershopBookingAccess } from "@/features/scheduling/booking-access";

const SHOP_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SHOP_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SUBSCRIPTION_A = "11111111-1111-4111-8111-111111111111";
const SUBSCRIPTION_B = "22222222-2222-4222-8222-222222222222";

function subscriptionRow(overrides: FakeRow = {}): FakeRow {
  return {
    id: SUBSCRIPTION_A,
    barbershop_id: SHOP_A,
    status: "past_due",
    past_due_since: "2026-11-16T00:00:00.000Z",
    grace_period_ends_at: "2026-11-19T00:00:00.000Z",
    created_at: "2026-11-01T00:00:00.000Z",
    ...overrides,
  };
}

function installBookingAccessRpc(
  db: FakeSupabase,
  now: () => Date,
): void {
  db.setRpcHandler("get_barbershop_booking_access", (args) => {
    const shopId = String(args.p_barbershop_id ?? "");
    const subscription = db
      .getRows("subscriptions")
      .filter(
        (row) =>
          row.barbershop_id === shopId &&
          ["pending", "trialing", "active", "past_due"].includes(
            String(row.status),
          ),
      )
      .sort((left, right) =>
        String(right.created_at).localeCompare(String(left.created_at)),
      )[0];

    if (!subscription) {
      return {
        allowed: true,
        state: "normal",
        subscription_status: null,
        past_due_since: null,
        grace_period_ends_at: null,
        seconds_remaining: null,
      };
    }

    const nowMs = now().getTime();
    const graceEnd = subscription.grace_period_ends_at
      ? new Date(String(subscription.grace_period_ends_at)).getTime()
      : null;
    const blocked =
      subscription.status === "past_due" &&
      (graceEnd === null || graceEnd <= nowMs);

    return {
      allowed: !blocked,
      state:
        subscription.status !== "past_due"
          ? "normal"
          : blocked
            ? "blocked"
            : "grace",
      subscription_status: subscription.status,
      past_due_since: subscription.past_due_since ?? null,
      grace_period_ends_at: subscription.grace_period_ends_at ?? null,
      seconds_remaining:
        subscription.status === "past_due" && graceEnd !== null && !blocked
          ? Math.ceil((graceEnd - nowMs) / 1000)
          : null,
    };
  });
}

describe("autorização central de novos agendamentos", () => {
  const pastDueSince = new Date("2026-11-16T00:00:00.000Z");
  const graceEnd = new Date(pastDueSince.getTime() + 72 * 60 * 60 * 1000);

  it("permite agendamento faltando 71h59 para o fim", async () => {
    const databaseNow = new Date(
      pastDueSince.getTime() + 71 * 60 * 60 * 1000 + 59 * 60 * 1000,
    );
    const db = new FakeSupabase({
      subscriptions: [subscriptionRow({
        past_due_since: pastDueSince.toISOString(),
        grace_period_ends_at: graceEnd.toISOString(),
      })],
    });
    installBookingAccessRpc(db, () => databaseNow);

    const access = await getBarbershopBookingAccess(SHOP_A, db as never);

    expect(access).toMatchObject({
      allowed: true,
      state: "grace",
      subscriptionStatus: "past_due",
      gracePeriodEndsAt: graceEnd.toISOString(),
      secondsRemaining: 60 * 60 - 59 * 60,
    });
  });

  it("bloqueia exatamente no fim das 72 horas", async () => {
    const db = new FakeSupabase({
      subscriptions: [subscriptionRow({
        past_due_since: pastDueSince.toISOString(),
        grace_period_ends_at: graceEnd.toISOString(),
      })],
    });
    installBookingAccessRpc(db, () => graceEnd);

    const access = await getBarbershopBookingAccess(SHOP_A, db as never);

    expect(access).toMatchObject({
      allowed: false,
      state: "blocked",
      subscriptionStatus: "past_due",
      secondsRemaining: null,
    });
  });

  it("mantém bloqueio depois das 72 horas", async () => {
    const db = new FakeSupabase({
      subscriptions: [subscriptionRow({
        past_due_since: pastDueSince.toISOString(),
        grace_period_ends_at: graceEnd.toISOString(),
      })],
    });
    installBookingAccessRpc(db, () => new Date(graceEnd.getTime() + 1));

    await expect(
      getBarbershopBookingAccess(SHOP_A, db as never),
    ).resolves.toMatchObject({ allowed: false, state: "blocked" });
  });

  it("permite active e não consulta a inadimplência de outra barbearia", async () => {
    const db = new FakeSupabase({
      subscriptions: [
        subscriptionRow({
          id: SUBSCRIPTION_A,
          barbershop_id: SHOP_A,
          status: "past_due",
          grace_period_ends_at: graceEnd.toISOString(),
        }),
        subscriptionRow({
          id: SUBSCRIPTION_B,
          barbershop_id: SHOP_B,
          status: "active",
          past_due_since: null,
          grace_period_ends_at: null,
        }),
      ],
    });
    installBookingAccessRpc(db, () => graceEnd);

    await expect(
      getBarbershopBookingAccess(SHOP_B, db as never),
    ).resolves.toMatchObject({
      allowed: true,
      state: "normal",
      subscriptionStatus: "active",
    });
  });
});
