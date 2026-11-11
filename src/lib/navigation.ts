/**
 * Aceita apenas caminhos internos. Evita open redirect em ?proximo=.
 */
export function safeNextPath(
  value: string | null | undefined,
  fallback = "/dashboard",
): string {
  if (!value) {
    return fallback;
  }

  const trimmed = value.trim();

  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return fallback;
  }

  if (trimmed.includes("\\") || trimmed.includes("\n") || trimmed.includes("\r")) {
    return fallback;
  }

  return trimmed;
}
