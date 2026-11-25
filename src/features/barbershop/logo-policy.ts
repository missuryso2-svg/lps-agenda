export const BARBERSHOP_LOGO_BUCKET = "barbershop-logos";
export const MAX_BARBERSHOP_LOGO_BYTES = 2 * 1024 * 1024;
export const MAX_BARBERSHOP_LOGO_PIXELS = 16_000_000;
export const BARBERSHOP_LOGO_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isBarbershopLogoObject(
  shopId: string,
  objectName: string | null | undefined,
): objectName is string {
  if (!uuidPattern.test(shopId) || !objectName) return false;

  const [tenant, filename, extra] = objectName.split("/");
  return (
    tenant === shopId &&
    extra === undefined &&
    filename !== undefined &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/i.test(
      filename,
    )
  );
}
