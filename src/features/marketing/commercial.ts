import { parsePhoneNumberFromString } from "libphonenumber-js/max";

export const commercialPlans = [
  {
    code: "basico",
    name: "Básico",
    limit: "1 profissional ativo",
    description: "Para quem atende por conta própria.",
  },
  {
    code: "profissional",
    name: "Profissional",
    limit: "Até 5 profissionais ativos",
    description: "Para uma equipe que compartilha a agenda.",
  },
  {
    code: "premium",
    name: "Premium",
    limit: "Até 10 profissionais ativos",
    description: "Para coordenar mais cadeiras e horários.",
  },
] as const;

export type Inquiry = (typeof commercialPlans)[number]["code"] | "geral";

const messages: Record<Inquiry, string> = {
  basico:
    "Olá! Tenho interesse no plano Básico do LPS Agenda, para 1 profissional. Gostaria de conhecer os valores e as condições de contratação.",
  profissional:
    "Olá! Tenho interesse no plano Profissional do LPS Agenda, para até 5 profissionais. Gostaria de receber uma proposta comercial.",
  premium:
    "Olá! Tenho interesse no plano Premium do LPS Agenda, para até 10 profissionais. Gostaria de conhecer os valores e as condições.",
  geral:
    "Olá! Gostaria de conhecer o LPS Agenda e entender como ele pode ajudar na gestão da minha barbearia.",
};

export function commercialWhatsApp(
  number: string | undefined,
  inquiry: Inquiry,
): string | null {
  if (
    !number ||
    !/^[1-9][0-9]{6,14}$/.test(number) ||
    !Object.hasOwn(messages, inquiry)
  )
    return null;
  const phone = parsePhoneNumberFromString("+" + number, { extract: false });
  if (!phone?.isValid() || phone.number !== "+" + number) return null;
  const url = new URL(number, "https://wa.me/");
  url.searchParams.set("text", messages[inquiry]);
  return url.href;
}
