import { describe, expect, it } from "vitest";
import { publicLegacyImageUrl } from "@/features/public-booking/format";

describe("public booking image projection", () => {
  it("keeps a legacy public HTTPS path", () => {
    expect(publicLegacyImageUrl("https://agenda.example.org/images/rafael.webp"))
      .toBe("https://agenda.example.org/images/rafael.webp");
  });

  it.each([
    null,
    "shop/professional/photo.webp",
    "http://agenda.example.org/images/rafael.webp",
    "https://user:password@agenda.example.org/rafael.webp",
    "https://agenda.example.org/rafael.webp?token=private",
    "https://agenda.example.org/storage/v1/object/authenticated/photos/rafael.webp",
    "https://agenda.example.org/storage/v1/render/image/sign/photos/rafael.webp",
    "https://agenda.example.org/storage/v1/object/public/%62arber-photos/rafael.webp",
  ])("rejects private, credentialed or non-public image references", value => {
    expect(publicLegacyImageUrl(value)).toBeNull();
  });
});
