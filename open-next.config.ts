import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Dynamic HTML and private data keep their Next.js cache policy.
// No shared incremental cache, queue or storage binding in the local proof.
export default defineCloudflareConfig();
