export const networkGuardMessage =
  'Requisições de rede não são permitidas nos testes. Use vi.stubGlobal("fetch", ...) ou mocke a dependência externa.';

const blockedFetch: typeof fetch = () =>
  Promise.reject(new Error(networkGuardMessage));

// O Vitest restaura os stubs globais antes de cada teste (unstubGlobals).
// Assim, testes que substituem fetch com vi.stubGlobal continuam funcionando
// e voltam a encontrar esta proteção no teste seguinte.
globalThis.fetch = blockedFetch;
