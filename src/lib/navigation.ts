/**
 * Aceita apenas caminhos internos. Evita open redirect em ?proximo=.
 */
export function safeNextPath(
  value: unknown,
  fallback = "/dashboard",
): string {
  if (typeof value !== "string" || !value) {
    return fallback;
  }

  const trimmed = value.trim();

  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return fallback;
  }

  // WHATWG URL parsing removes tabs/newlines before resolving the authority.
  // Reject every control character before normalization, including outer ones.
  if (trimmed.includes("\\") || [...value].some((char) => {
    const code = char.charCodeAt(0);
    return code < 32 || code === 127;
  })) {
    return fallback;
  }

  return trimmed;
}
