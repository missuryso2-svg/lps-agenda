import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import sharp from "sharp";

const state = vi.hoisted(() => ({
  context: null as unknown,
  db: null as unknown,
  currentLogo: null as string | null,
  cleanup: [] as string[],
  uploadError: false,
  removeError: false,
  replaceError: null as string | null,
  upload: vi.fn(),
  remove: vi.fn(),
  lastReplace: null as Record<string, unknown> | null,
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/env/server", () => ({
  getAppUrl: () => "https://lpsagenda.com.br",
}));
vi.mock("@/lib/auth/dal", () => ({
  getActiveDashboardContext: vi.fn(async () => state.context),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => state.db),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    storage: {
      from: (bucket: string) => {
        if (bucket !== "barbershop-logos") throw new Error("unexpected bucket");
        return { upload: state.upload, remove: state.remove };
      },
    },
  }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { DELETE, POST } from "@/app/api/barbershop/logo/route";
import {
  BARBERSHOP_LOGO_BUCKET,
  barbershopLogoVersion,
  isBarbershopLogoObject,
  publicBarbershopLogoUrl,
} from "@/features/barbershop/logo";
import {
  boundedBarbershopLogo,
  maxBarbershopLogoBytes,
  normalizeBarbershopLogo,
} from "@/features/barbershop/logo-image";
import { BarbershopLogoCard } from "@/features/settings/components/barbershop-logo-card";

const SHOP_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SHOP_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OWNER = "11111111-1111-4111-8111-111111111111";
const STAFF = "22222222-2222-4222-8222-222222222222";
const ORIGIN = "https://lpsagenda.com.br";

function ownerContext(role: "owner" | "staff" = "owner") {
  return {
    user: { id: role === "owner" ? OWNER : STAFF },
    active: {
      role,
      barbershop_id: SHOP_A,
      barbershop: { id: SHOP_A, slug: "aurora", logo_url: state.currentLogo },
    },
  };
}

function setupDb() {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(async () => ({ data: { logo_url: state.currentLogo }, error: null })),
  };
  const db = {
    from: vi.fn(() => query),
    storage: {
      from: vi.fn((bucket: string) => {
        expect(bucket).toBe(BARBERSHOP_LOGO_BUCKET);
        return {
          upload: state.upload,
          remove: state.remove,
        };
      }),
    },
    rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
      if (name === "replace_barbershop_logo") {
        state.lastReplace = args;
        if (state.replaceError) {
          return { data: null, error: { code: state.replaceError } };
        }
        const previous = state.currentLogo;
        state.currentLogo = args.p_replacement_object as string | null;
        if (previous && isBarbershopLogoObject(SHOP_A, previous)) {
          state.cleanup.push(previous);
        }
        return {
          data: { previous, current: state.currentLogo },
          error: null,
        };
      }
      if (name === "barbershop_logo_cleanup_list") {
        return { data: [...state.cleanup], error: null };
      }
      if (name === "barbershop_logo_cleanup_result") {
        const key = String(args.p_object_name);
        if (args.p_removed) {
          state.cleanup = state.cleanup.filter((item) => item !== key);
        } else if (!state.cleanup.includes(key) && state.currentLogo !== key) {
          state.cleanup.push(key);
        }
        return { data: true, error: null };
      }
      return { data: null, error: { code: "PGRST202" } };
    }),
  };
  state.db = db;
  return db;
}

function request(
  method: "POST" | "DELETE",
  currentLogo: string | null,
  body?: BodyInit,
  contentType?: string,
) {
  return new Request(`${ORIGIN}/api/barbershop/logo`, {
    method,
    headers: {
      origin: ORIGIN,
      "x-logo-shop": SHOP_A,
      "x-logo-version": barbershopLogoVersion(currentLogo),
      ...(contentType ? { "content-type": contentType } : {}),
    },
    ...(body === undefined ? {} : { body }),
  });
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
  state.context = ownerContext();
  state.currentLogo = null;
  state.cleanup = [];
  state.uploadError = false;
  state.removeError = false;
  state.replaceError = null;
  state.lastReplace = null;
  state.upload.mockReset().mockImplementation(async () =>
    state.uploadError
      ? { data: null, error: { statusCode: "503" } }
      : { data: { path: "uploaded" }, error: null },
  );
  state.remove.mockReset().mockImplementation(async (keys: string[]) =>
    state.removeError
      ? { data: null, error: { statusCode: "503" } }
      : { data: keys, error: null },
  );
  setupDb();
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
});

describe("validação e normalização de logos", () => {
  it.each([
    ["image/png", "png"],
    ["image/jpeg", "jpeg"],
    ["image/webp", "webp"],
  ])("decodifica %s e normaliza sem corte", async (mime, format) => {
    const input = await sharp({
      create: {
        width: 900,
        height: 450,
        channels: 4,
        background: { r: 180, g: 90, b: 20, alpha: 0.4 },
      },
    })
      .toFormat(format as "png" | "jpeg" | "webp")
      .toBuffer();

    const normalized = await normalizeBarbershopLogo(input, mime);
    const metadata = await sharp(normalized).metadata();
    expect(metadata).toMatchObject({ format: "webp", width: 900, height: 450 });
    expect(metadata.hasAlpha).toBe(mime !== "image/jpeg");
    expect(normalized.length).toBeLessThanOrEqual(maxBarbershopLogoBytes);
  });

  it("limita dimensões e rejeita SVG, MIME falso, bytes corrompidos e excesso de 2 MB", async () => {
    const validPng = await sharp({
      create: { width: 20, height: 20, channels: 4, background: "transparent" },
    })
      .png()
      .toBuffer();
    const oversized = Buffer.alloc(maxBarbershopLogoBytes + 1);
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

    await expect(normalizeBarbershopLogo(svg, "image/svg+xml")).rejects.toThrow();
    await expect(normalizeBarbershopLogo(svg, "image/png")).rejects.toThrow();
    await expect(normalizeBarbershopLogo(validPng.subarray(0, 40), "image/png")).rejects.toThrow();
    await expect(normalizeBarbershopLogo(validPng, "image/jpeg")).rejects.toThrow();
    await expect(normalizeBarbershopLogo(Buffer.from("invalid"), "image/png")).rejects.toThrow();
    await expect(normalizeBarbershopLogo(oversized, "image/png")).rejects.toThrow();

    const tooManyPixels = await sharp({
      create: { width: 4096, height: 4096, channels: 3, background: "white" },
    })
      .png()
      .toBuffer();
    await expect(normalizeBarbershopLogo(tooManyPixels, "image/png")).rejects.toThrow();
  });

  it("limita o stream antes de acumular arquivos maiores que 2 MB", async () => {
    const response = new Request("https://lpsagenda.com.br/upload", {
      method: "POST",
      headers: { "content-type": "image/png", "content-length": String(maxBarbershopLogoBytes + 1) },
      body: new Uint8Array([1, 2, 3]),
    });
    await expect(boundedBarbershopLogo(response)).rejects.toThrow();

    const unboundedHeader = new Request("https://lpsagenda.com.br/upload", {
      method: "POST",
      headers: { "content-type": "image/png" },
      body: new Uint8Array(maxBarbershopLogoBytes + 1),
    });
    expect(unboundedHeader.headers.has("content-length")).toBe(false);
    await expect(boundedBarbershopLogo(unboundedHeader)).rejects.toThrow();
  });

  it("constrói URLs públicas somente para chaves do tenant e mantém URL legada", () => {
    const key = `${SHOP_A}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp`;
    expect(isBarbershopLogoObject(SHOP_A, key)).toBe(true);
    expect(isBarbershopLogoObject(SHOP_B, key)).toBe(false);
    expect(publicBarbershopLogoUrl(SHOP_A, key)).toBe(
      `https://project.supabase.co/storage/v1/object/public/${BARBERSHOP_LOGO_BUCKET}/${key}`,
    );
    expect(publicBarbershopLogoUrl(SHOP_A, `https://${SHOP_B}.example/logo.webp`)).toBe(
      `https://${SHOP_B}.example/logo.webp`,
    );
    expect(publicBarbershopLogoUrl(SHOP_A, `${SHOP_B}/other.webp`)).toBeNull();
  });
});

describe("endpoint autenticado de logo da barbearia", () => {
  it("armazena WebP no tenant da sessão e persiste a referência sem receber shop_id", async () => {
    const png = await sharp({
      create: { width: 80, height: 40, channels: 4, background: "transparent" },
    })
      .png()
      .toBuffer();

    const response = await POST(request("POST", null, png, "image/png"));
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result).toMatchObject({
      logoUrl: expect.stringContaining("/storage/v1/object/public/barbershop-logos/"),
      version: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
      message: "Logo atualizada.",
    });
    expect(state.lastReplace).toMatchObject({
      p_barbershop_id: SHOP_A,
      p_expected_object: null,
      p_replacement_object: expect.stringMatching(new RegExp(`^${SHOP_A}/`)),
    });
    expect(state.upload).toHaveBeenCalledWith(
      state.lastReplace?.p_replacement_object,
      expect.any(Buffer),
      expect.objectContaining({ contentType: "image/webp", upsert: false }),
    );
  });

  it("nega equipe, origem inválida e version stale antes de gravar", async () => {
    const png = await sharp({
      create: { width: 16, height: 16, channels: 4, background: "black" },
    })
      .png()
      .toBuffer();

    state.context = ownerContext("staff");
    expect((await POST(request("POST", null, png, "image/png"))).status).toBe(403);
    expect(state.upload).not.toHaveBeenCalled();

    state.context = ownerContext();
    const staleTab = request("POST", null, png, "image/png");
    staleTab.headers.set("x-logo-shop", SHOP_B);
    expect((await POST(staleTab)).status).toBe(409);
    expect(state.upload).not.toHaveBeenCalled();
    const wrongOrigin = request("POST", null, png, "image/png");
    const wrongOriginRequest = new Request(wrongOrigin, {
      headers: { ...Object.fromEntries(wrongOrigin.headers), origin: "https://attacker.example" },
    });
    expect((await POST(wrongOriginRequest)).status).toBe(403);
    expect(state.upload).not.toHaveBeenCalled();

    state.currentLogo = `${SHOP_A}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp`;
    expect((await POST(request("POST", null, png, "image/png"))).status).toBe(409);
    expect(state.upload).not.toHaveBeenCalled();
  });

  it("rejeita formato inválido e rastreia falha na remoção da versão anterior", async () => {
    state.currentLogo = `${SHOP_A}/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.webp`;
    state.removeError = true;
    const response = await DELETE(request("DELETE", state.currentLogo));
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result).toMatchObject({
      logoUrl: null,
      version: barbershopLogoVersion(null),
      message: expect.stringContaining("limpeza do arquivo anterior está pendente"),
    });
    expect(state.currentLogo).toBeNull();
    expect(state.cleanup).toContain(`${SHOP_A}/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.webp`);

    const invalid = await POST(
      request("POST", null, Buffer.from("<svg/>"), "image/svg+xml"),
    );
    expect(invalid.status).toBe(400);
  });

  it("limpa upload parcial e não sobrescreve uma logo após conflito", async () => {
    const png = await sharp({
      create: { width: 32, height: 32, channels: 4, background: "transparent" },
    })
      .png()
      .toBuffer();

    state.uploadError = true;
    const uploadFailed = await POST(request("POST", null, png, "image/png"));
    expect(uploadFailed.status).toBe(503);
    expect(state.remove).toHaveBeenCalledOnce();
    expect(state.lastReplace).toBeNull();

    state.uploadError = false;
    state.replaceError = "40001";
    const conflict = await POST(request("POST", null, png, "image/png"));
    expect(conflict.status).toBe(409);
    expect(state.remove).toHaveBeenCalledTimes(2);
  });

  it("remove logo pelo caminho autorizado e confirma a limpeza", async () => {
    const current = `${SHOP_A}/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.webp`;
    state.currentLogo = current;
    const response = await DELETE(request("DELETE", current));
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result).toMatchObject({ logoUrl: null, version: barbershopLogoVersion(null), message: "Logo removida." });
    expect(state.currentLogo).toBeNull();
    expect(state.cleanup).toEqual([]);
    expect(state.remove).toHaveBeenCalledWith([current]);
  });

  it("omite imagem e versão quando a releitura do conflito falha", async () => {
    const current = `${SHOP_A}/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.webp`;
    state.currentLogo = current;
    const db = setupDb();
    db.from().maybeSingle.mockResolvedValueOnce({ data: { logo_url: current }, error: null })
      .mockRejectedValueOnce(new Error("offline"));
    state.replaceError = "40001";
    const response = await DELETE(request("DELETE", current));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ message: expect.stringContaining("Atualize a página") });
    expect(state.remove).not.toHaveBeenCalled();
  });

  it("preserva a imagem confirmada se a resposta da troca e a releitura se perderem", async () => {
    const db = setupDb();
    const lookup = db.from();
    lookup.maybeSingle.mockResolvedValueOnce({ data: { logo_url: null }, error: null })
      .mockRejectedValueOnce(new Error("offline"));
    db.rpc.mockImplementationOnce(async (_name, args) => {
      state.currentLogo = String(args.p_replacement_object);
      return { data: null, error: { code: "" } };
    });
    const png = await sharp({
      create: { width: 16, height: 16, channels: 4, background: "transparent" },
    }).png().toBuffer();
    expect((await POST(request("POST", null, png, "image/png"))).status).toBe(503);
    expect(state.currentLogo).toMatch(new RegExp(`^${SHOP_A}/`));
    expect(state.remove).not.toHaveBeenCalled();
  });
});

describe("card de logo", () => {
  it("mostra o fallback e a ação de envio para uma barbearia sem imagem", () => {
    const html = renderToStaticMarkup(
      createElement(BarbershopLogoCard, {
        shopId: SHOP_A,
        shopName: "Barbearia Aurora",
        logoUrl: null,
        logoVersion: barbershopLogoVersion(null),
        canManage: true,
      }),
    );

    expect(html).toContain("Logo da barbearia");
    expect(html).toContain("Enviar logo");
    expect(html).toContain("Sem logo, a página pública usa as iniciais");
    expect(html).not.toContain("Remover logo");
  });

  it("expõe troca e remoção quando existe logo, e não habilita escrita para staff", () => {
    const html = renderToStaticMarkup(
      createElement(BarbershopLogoCard, {
        shopId: SHOP_A,
        shopName: "Barbearia Aurora",
        logoUrl: "https://project.supabase.co/storage/v1/object/public/barbershop-logos/logo.webp",
        logoVersion: barbershopLogoVersion(
          `${SHOP_A}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp`,
        ),
        canManage: false,
      }),
    );

    expect(html).toContain("Alterar logo");
    expect(html).toContain("Remover logo");
    expect(html).toContain("A edição da logo é restrita ao proprietário");
    expect(html.match(/disabled=""/g)?.length).toBeGreaterThanOrEqual(3);
  });
});
