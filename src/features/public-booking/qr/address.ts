import { slugSchema } from "@/lib/validation/barbershop";

export const printOriginMessage =
  "Configure o endereço público do LPS Agenda para gerar o QR Code de impressão.";

export function bookingAddress(
  rawOrigin: string | undefined,
  slug: string,
  development: boolean,
) {
  const parsed = slugSchema.safeParse(slug);
  if (
    !rawOrigin ||
    !parsed.success ||
    parsed.data !== slug ||
    /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(slug)
  )
    return null;
  try {
    const url = new URL(rawOrigin);
    if (
      !/^https?:\/\/[^/?#\\\s@]+\/?$/i.test(rawOrigin) ||
      url.username ||
      url.password
    )
      return null;
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (
      local
        ? !development
        : url.protocol !== "https:" ||
          url.port ||
          !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/i.test(
            url.hostname,
          ) ||
          /(?:^|\.)(?:localhost|local|internal|test|invalid|example)$/.test(
            url.hostname,
          )
    )
      return null;
    return { url: url.origin + "/agendar/" + slug, local };
  } catch {
    return null;
  }
}

export function printableLogo(
  raw: string | null,
  appOrigin: string,
  storageOrigin: string | undefined,
) {
  if (!raw) return null;
  try {
    const logo = new URL(raw);
    if (
      logo.protocol !== "https:" ||
      logo.username ||
      logo.password ||
      logo.search ||
      logo.hash
    )
      return null;
    const siteAsset =
      logo.origin === new URL(appOrigin).origin &&
      /^\/(?:images|brand)\//.test(logo.pathname);
    const storageAsset =
      storageOrigin &&
      logo.origin === new URL(storageOrigin).origin &&
      logo.pathname.startsWith("/storage/v1/object/public/");
    return siteAsset || storageAsset ? logo.href : null;
  } catch {
    return null;
  }
}
