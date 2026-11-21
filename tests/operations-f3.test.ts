import { describe, expect, it } from "vitest";
import { ratingSchema, walkInFormSchema } from "@/lib/validation/appointments";
describe("conclusão informada pela equipe", () => {
  it.each([
    [null, null],
    [0, null],
    [null, 10],
    [0, 10],
  ])("aceita critérios independentes %s e %s", (barberScore, shopScore) => {
    expect(ratingSchema.parse({ barberScore, shopScore })).toEqual({
      barberScore,
      shopScore,
    });
  });
  it.each([-1, 11, 4.5, "0", undefined])(
    "rejeita nota inválida %s",
    (value) => {
      expect(
        ratingSchema.safeParse({ shopScore: value, barberScore: null }).success,
      ).toBe(false);
    },
  );
  it("valida o nome do cliente presencial", () => {
    const name = walkInFormSchema.shape.newCustomerName;
    expect(name.parse("  Cliente QA  ")).toBe("Cliente QA");
    expect(name.safeParse(" ").success).toBe(false);
  });
});
