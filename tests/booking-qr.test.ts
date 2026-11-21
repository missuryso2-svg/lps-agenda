import { describe, it, expect } from "vitest";
import {
  bookingAddress,
  printableLogo,
} from "@/features/public-booking/qr/address";
describe("endereço do QR", () => {
  it("contém somente o endereço público da loja", () =>
    expect(
      bookingAddress("https://agenda.example.org/", "minha-loja", false),
    ).toEqual({
      url: "https://agenda.example.org/agendar/minha-loja",
      local: false,
    }));
  it.each([
    "http://agenda.example.org",
    "https://user:pass@agenda.example.org",
    "https://agenda.example.org?token=no",
    "https://agenda.example.org/a",
    "https://agenda.example.org/#x",
    "http://localhost:3000",
    "https://127.0.0.1",
    "https://store.local",
    "https://agenda.example.org:8000",
    "",
  ])("recusa origem %s", (o) =>
    expect(bookingAddress(o, "minha-loja", false)).toBeNull(),
  );
  it.each([
    "../loja",
    "abc?q=x",
    "loja/abc",
    "A B",
    "  minha-loja",
    "22222222-2222-4222-9222-222222222222",
  ])("recusa slug %s", (s) =>
    expect(bookingAddress("https://agenda.example.org", s, false)).toBeNull(),
  );
  it("permite prévia local em desenvolvimento", () =>
    expect(
      bookingAddress("http://localhost:3000", "minha-loja", true)?.local,
    ).toBe(true));
  it("limita logos aos recursos públicos permitidos", () => {
    const scope = "https://agenda.example.org",
      store = "https://test.supabase.co";
    expect(
      printableLogo(
        store + "/storage/v1/object/public/logos/a.png",
        scope,
        store,
      ),
    ).toBeTruthy();
    for (const l of [
      "https://other.example/a.png",
      store + "/storage/v1/object/sign/file?token=test",
      scope + "/dashboard/foto",
    ])
      expect(printableLogo(l, scope, store)).toBeNull();
  });
});
