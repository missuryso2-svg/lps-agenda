// Use the configured origin instead of proxy headers. Loopback QA can
// explicitly use HTTP, while hosted HTTPS sessions remain transport-bound.
export const authCookieOptions = {
  secure: process.env.NEXT_PUBLIC_APP_URL?.startsWith("https://") ?? process.env.NODE_ENV === "production",
};
