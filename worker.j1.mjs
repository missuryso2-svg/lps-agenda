import openNext from "./.open-next/worker.js";

const worker = {
  async fetch(request, env, ctx) {
    const response = await openNext.fetch(request, env, ctx);
    const policy = response.headers.get("Content-Security-Policy-Report-Only");
    if (env.CSP_ENFORCE !== "true" || !policy) return response;

    // The Proxy supplies a fresh policy and forwards its nonce to the renderer.
    // Replace the config baseline after OpenNext has applied its route headers.
    const finalized = new Response(response.body, response);
    finalized.headers.set("Content-Security-Policy", policy);
    finalized.headers.delete("Content-Security-Policy-Report-Only");
    return finalized;
  },
};

export default worker;
