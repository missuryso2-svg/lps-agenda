import { parsePhoneNumberFromString } from "libphonenumber-js/max";

export function customerWhatsApp(phone: string | null) {
  const value = phone?.trim();
  if (!value || !/^\+?[\d\s().-]+$/.test(value)) return null;
  const digits = value.replace(/\D/g, "");
  const international =
    value.startsWith("+") ||
    (digits.startsWith("55") && [12, 13].includes(digits.length));
  const number = parsePhoneNumberFromString(
    international ? "+" + digits : digits,
    { defaultCountry: "BR", extract: false },
  );
  return number?.isValid() ? "https://wa.me/" + number.number.slice(1) : null;
}
