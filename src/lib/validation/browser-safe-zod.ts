import { config } from "zod/v4/core";

// The browser uses the interpreter directly under the nonce-based CSP.
if (typeof window !== "undefined") {
  config({ jitless: true });
}
