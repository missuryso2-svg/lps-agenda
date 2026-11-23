import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { NextRequest } from "next/server";

import type {
  PublicBookingPageData,
  PublicBookingPageResult,
} from "@/features/public-booking/types";
import {
  adPlacement,
  contentRevision,
  hasGuideContent,
} from "@/features/monetization/placement";

const routeState = vi.hoisted(() => ({
  configured: true,
  result: null as unknown,
}));

vi.mock("@/features/public-booking/config", () => ({
  isPublicBookingConfigured: () => routeState.configured,
}));

vi.mock("@/features/public-booking/queries", () => ({
  getPublicBookingPage: () => routeState.result,
}));

import { GET as getGuide } from "@/app/agendar/[slug]/sobre/route";

const root = process.cwd();
const origin = "https://agenda.example.org";
const publisherForTest = `ca-pub-${"1".repeat(16)}`;
const slotForTest = "1234567890";
const envNames = [
  "NODE_ENV",
  "NEXT_PUBLIC_APP_URL",
  "ADSENSE_ENABLED",
  "ADSENSE_DOMAIN_APPROVED",
  "ADSENSE_APPROVED_ORIGIN",
  "ADSENSE_PUBLISHER_ID",
  "ADSENSE_BOOKING_SLOT",
  "ADSENSE_REVIEWED_SHOPS",
  "ADSENSE_PRIVACY_REVIEWED",
  "ADSENSE_CMP_READY",
  "ADSENSE_CMP_ID",
] as const;

let originalEnv = new Map<string, string | undefined>();

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

function guideData(): PublicBookingPageData {
  return {
    barbershop: {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      slug: "barbearia-exemplo",
      name: "Barbearia Exemplo",
      description: "Um espaço independente de barbearia no centro da cidade.",
      phone: "11987654321",
      addressStreet: "Rua Exemplo",
      addressNumber: "10",
      addressComplement: null,
      addressDistrict: "Centro",
      addressCity: "São Paulo",
      addressState: "SP",
      addressZip: "01000-000",
      timezone: "America/Sao_Paulo",
      logoUrl: null,
      coverUrl: null,
      status: "active",
    },
    services: [
      {
        id: "11111111-1111-4111-8111-111111111111",
        name: "Corte clássico",
        description: "Corte feito com tesoura ou máquina.",
        durationMinutes: 30,
        priceCents: 5000,
      },
      {
        id: "22222222-2222-4222-8222-222222222222",
        name: "Barba",
        description: "Aparar e alinhar a barba.",
        durationMinutes: 25,
        priceCents: 3500,
      },
    ],
    barbers: [],
    businessHours: [
      { weekday: 1, opensAt: "09:00:00", closesAt: "18:00:00" },
      { weekday: 2, opensAt: "09:00:00", closesAt: "18:00:00" },
    ],
    dateWindow: { min: "2026-11-23", max: "2026-12-23" },
  };
}

function reviewedEnv(data = guideData()): Record<string, string | undefined> {
  return {
    NODE_ENV: "production",
    ADSENSE_ENABLED: "true",
    ADSENSE_DOMAIN_APPROVED: "true",
    ADSENSE_APPROVED_ORIGIN: origin,
    ADSENSE_PUBLISHER_ID: publisherForTest,
    ADSENSE_BOOKING_SLOT: slotForTest,
    ADSENSE_REVIEWED_SHOPS: `${data.barbershop.slug}@${contentRevision(data)}`,
    ADSENSE_PRIVACY_REVIEWED: "true",
    ADSENSE_CMP_READY: "true",
    ADSENSE_CMP_ID: "123",
  };
}

function makeRequest(
  url = `${origin}/agendar/barbearia-exemplo/sobre`,
  cookies: Array<{ name: string; value: string }> = [],
): NextRequest {
  return {
    nextUrl: new URL(url),
    cookies: { getAll: () => cookies },
  } as unknown as NextRequest;
}

type ConsentData = {
  cmpStatus: string;
  cmpId: number;
  tcString: string;
  eventStatus: string;
  vendor: { consents: Record<number, boolean> };
  purpose: { consents: Record<number, boolean> };
  publisher: { restrictions: Record<number, Record<number, number>> };
};

type TcfListener = (data: ConsentData, success: boolean) => void;

class FakeElement {
  hidden = true;
  dataset: Record<string, string> = {};
  style: Record<string, string> = {};
  textContent = "";
  className = "";
  src = "";
  async = false;
  crossOrigin = "";
  referrerPolicy = "";
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  children: unknown[] = [];
  private listeners = new Map<string, () => void>();

  addEventListener(name: string, listener: () => void): void {
    this.listeners.set(name, listener);
  }

  click(name = "click"): void {
    this.listeners.get(name)?.();
  }

  replaceChildren(...children: unknown[]): void {
    this.children = children;
  }
}

type FakeObserver = {
  callback: () => void;
  observe: () => void;
  disconnect: () => void;
};

function runPreferenceScript(options: {
  globalPrivacyControl?: boolean;
  width?: number;
  withCmp?: boolean;
} = {}) {
  const panel = new FakeElement();
  panel.dataset = {
    origin,
    page: "/agendar/barbearia-exemplo/sobre",
    publisher: publisherForTest,
    slot: slotForTest,
    cmp: "123",
  };
  const area = new FakeElement();
  const choose = new FakeElement();
  const decline = new FakeElement();
  const status = new FakeElement();
  const elements = new Map([
    ["preferences", panel],
    ["advertising", area],
    ["choose", choose],
    ["decline", decline],
    ["choice-status", status],
  ]);
  const scripts: FakeElement[] = [];
  const observers: FakeObserver[] = [];
  const frame = {};
  let tcfListener: TcfListener | null = null;
  let preferenceOpens = 0;
  let reloads = 0;
  const windowObject: Record<string, unknown> = {
    adsbygoogle: [],
    addEventListener: () => undefined,
  };

  if (options.withCmp) {
    windowObject.__tcfapi = (
      command: string,
      version: number,
      callback: TcfListener,
    ) => {
      if (command === "addEventListener" && version === 2) {
        tcfListener = callback;
      }
    };
    windowObject.lpsOpenAdPreferences = () => {
      preferenceOpens += 1;
    };
  }

  class Observer implements FakeObserver {
    constructor(readonly callback: () => void) {
      observers.push(this);
    }
    observe(): void {}
    disconnect(): void {}
  }

  const context = {
    document: {
      referrer: "",
      documentElement: { clientWidth: options.width ?? 1024 },
      getElementById: (id: string) => elements.get(id) ?? null,
      createElement: () => new FakeElement(),
      createTextNode: (text: string) => ({ textContent: text }),
      head: {
        append: (element: FakeElement) => scripts.push(element),
      },
    },
    navigator: { globalPrivacyControl: options.globalPrivacyControl ?? false },
    self: frame,
    top: frame,
    location: {
      origin,
      pathname: "/agendar/barbearia-exemplo/sobre",
      search: "",
      hash: "",
      reload: () => {
        reloads += 1;
      },
    },
    window: windowObject,
    MutationObserver: Observer,
  };

  runInNewContext(read("public/booking-ad-preferences.js"), context);

  return {
    area,
    choose,
    decline,
    panel,
    preferenceOpens: () => preferenceOpens,
    reloads: () => reloads,
    scripts,
    status,
    tcfListener: () => tcfListener,
    observers,
    windowObject,
  };
}

function grantedConsent(): ConsentData {
  return {
    cmpStatus: "loaded",
    cmpId: 123,
    tcString: "synthetic-consent-string",
    eventStatus: "useractioncomplete",
    vendor: { consents: { 755: true } },
    purpose: {
      consents: Object.fromEntries(
        [1, 2, 3, 4, 7, 9, 10].map((purpose) => [purpose, true]),
      ),
    },
    publisher: { restrictions: {} },
  };
}

beforeEach(() => {
  originalEnv = new Map(envNames.map((name) => [name, process.env[name]]));
  for (const name of envNames) {
    delete process.env[name];
  }
  routeState.configured = true;
  routeState.result = { status: "ready", data: guideData() } satisfies PublicBookingPageResult;
});

afterEach(() => {
  for (const [name, value] of originalEnv) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
});

describe("gates de preparação do AdSense", () => {
  it("exige conteúdo público real para disponibilizar a ficha", () => {
    const data = guideData();

    expect(hasGuideContent(data)).toBe(true);
    expect(
      hasGuideContent({
        ...data,
        barbershop: { ...data.barbershop, status: "inactive" },
      }),
    ).toBe(false);
    expect(
      hasGuideContent({
        ...data,
        services: data.services.map((service) => ({ ...service, description: null })),
      }),
    ).toBe(false);
    expect(hasGuideContent({ ...data, businessHours: [] })).toBe(false);
  });

  it("invalida a revisão quando qualquer conteúdo exibido muda", () => {
    const data = guideData();
    const originalRevision = contentRevision(data);

    expect(contentRevision({ ...data, services: [...data.services].reverse() })).toBe(
      originalRevision,
    );
    expect(
      contentRevision({
        ...data,
        services: data.services.map((service, index) =>
          index === 0 ? { ...service, durationMinutes: service.durationMinutes + 5 } : service,
        ),
      }),
    ).not.toBe(originalRevision);
    expect(
      contentRevision({
        ...data,
        businessHours: [{ ...data.businessHours[0]!, closesAt: "17:00:00" }],
      }),
    ).not.toBe(originalRevision);
  });

  it("mantém a publicidade desligada quando a configuração está ausente", () => {
    expect(adPlacement(guideData(), {}, origin)).toBeNull();
  });

  it.each([
    ["produção", { NODE_ENV: "development" }],
    ["flag de ativação", { ADSENSE_ENABLED: "false" }],
    ["aprovação do domínio", { ADSENSE_DOMAIN_APPROVED: "false" }],
    ["origem aprovada", { ADSENSE_APPROVED_ORIGIN: "https://other.example.org" }],
    ["Publisher ID", { ADSENSE_PUBLISHER_ID: "" }],
    ["slot", { ADSENSE_BOOKING_SLOT: "invalid" }],
    ["revisão de privacidade", { ADSENSE_PRIVACY_REVIEWED: "false" }],
    ["CMP", { ADSENSE_CMP_READY: "false" }],
    ["revisão de conteúdo", { ADSENSE_REVIEWED_SHOPS: "barbearia-exemplo@stale" }],
  ])("falha fechado sem %s", (_label, override) => {
    expect(adPlacement(guideData(), { ...reviewedEnv(), ...override }, origin)).toBeNull();
  });

  it("rejeita uma origem local ou uma URL de aplicação inválida", () => {
    const env = reviewedEnv();

    expect(adPlacement(guideData(), env, "http://localhost:3000")).toBeNull();
    expect(adPlacement(guideData(), env, "javascript:alert(1)")).toBeNull();
  });

  it("libera apenas a ficha e a revisão exatas quando todos os gates estão satisfeitos", () => {
    expect(adPlacement(guideData(), reviewedEnv(), origin)).toEqual({
      publisher: publisherForTest,
      slot: slotForTest,
      cmp: "123",
      origin,
    });
  });
});

describe("rota informativa pública", () => {
  it("renderiza a ficha sem anúncio, espaço vazio ou script quando AdSense está desligado", async () => {
    process.env.NEXT_PUBLIC_APP_URL = origin;
    const response = await getGuide(makeRequest(), {
      params: Promise.resolve({ slug: "barbearia-exemplo" }),
    });
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("Consultar horários para agendar");
    expect(html).not.toContain("adsbygoogle");
    expect(html).not.toContain("booking-ad-preferences.js");
    expect(html).not.toContain('id="advertising"');
  });

  it("não carrega o runtime de anúncio antes da escolha/CMP e não expõe campos privados", async () => {
    const data = {
      ...guideData(),
      privateCustomerName: "PRIVATE_CUSTOMER_SENTINEL",
      privateCustomerEmail: "private@example.test",
    } as PublicBookingPageData & {
      privateCustomerName: string;
      privateCustomerEmail: string;
    };
    routeState.result = { status: "ready", data };
    Object.assign(process.env, reviewedEnv(data), {
      NEXT_PUBLIC_APP_URL: origin,
    });

    const response = await getGuide(makeRequest(), {
      params: Promise.resolve({ slug: "barbearia-exemplo" }),
    });
    const html = await response.text();

    expect(html).toContain("booking-ad-preferences.js");
    expect(html).toContain('id="advertising"');
    expect(html).not.toContain("pagead2.googlesyndication.com");
    expect(html).not.toContain("PRIVATE_CUSTOMER_SENTINEL");
    expect(html).not.toContain("private@example.test");
    expect(html).not.toContain("11987654321");
  });

  it("suprime os controles publicitários para uma sessão autenticada", async () => {
    const data = guideData();
    Object.assign(process.env, reviewedEnv(data), {
      NEXT_PUBLIC_APP_URL: origin,
    });
    const response = await getGuide(
      makeRequest(undefined, [{ name: "sb-project-auth-token.0", value: "session" }]),
      { params: Promise.resolve({ slug: data.barbershop.slug }) },
    );
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).not.toContain("booking-ad-preferences.js");
    expect(html).not.toContain('id="advertising"');
  });

  it("recusa query strings e configuração pública ausente sem bloquear o agendamento", async () => {
    const withQuery = await getGuide(
      makeRequest(`${origin}/agendar/barbearia-exemplo/sobre?token=private`),
      { params: Promise.resolve({ slug: "barbearia-exemplo" }) },
    );

    expect(withQuery.status).toBe(404);
    expect(await withQuery.text()).not.toContain("private");

    routeState.configured = false;
    const withoutConfig = await getGuide(makeRequest(), {
      params: Promise.resolve({ slug: "barbearia-exemplo" }),
    });
    expect(withoutConfig.status).toBe(404);
  });
});

describe("adapter de consentimento no navegador", () => {
  it("não requisita scripts e falha fechado se não houver CMP", () => {
    const app = runPreferenceScript();

    expect(app.panel.hidden).toBe(false);
    expect(app.scripts).toHaveLength(0);
    app.choose.click();
    expect(app.scripts).toHaveLength(0);
    expect(app.status.textContent).toContain("não está disponível");
    expect(app.area.hidden).toBe(true);
    expect(app.reloads()).toBe(0);
  });

  it("só pede o script do AdSense após escolha explícita e consentimento TCF", () => {
    const app = runPreferenceScript({ withCmp: true });

    expect(app.scripts).toHaveLength(0);
    app.choose.click();
    expect(app.preferenceOpens()).toBe(1);
    expect(app.scripts).toHaveLength(0);

    app.tcfListener()?.(grantedConsent(), true);

    expect(app.scripts).toHaveLength(1);
    expect(app.scripts[0]?.src).toContain(
      "https://pagead2.googlesyndication.com/",
    );
    expect(app.scripts[0]?.referrerPolicy).toBe("no-referrer");
    app.scripts[0]?.onload?.();
    expect(app.area.hidden).toBe(false);
    expect(app.windowObject.adsbygoogle).toHaveLength(1);
    expect(app.reloads()).toBe(0);
  });

  it("trata bloqueio de rede sem erro, anúncio residual ou redirecionamento", () => {
    const app = runPreferenceScript({ withCmp: true });
    app.choose.click();
    app.tcfListener()?.(grantedConsent(), true);
    app.scripts[0]?.onerror?.();

    expect(app.area.hidden).toBe(true);
    expect(app.status.textContent).toContain("Publicidade indisponível");
    expect(app.reloads()).toBe(0);
  });

  it("respeita GPC e telas estreitas sem requisitar anúncios", () => {
    const gpc = runPreferenceScript({ globalPrivacyControl: true, withCmp: true });
    expect(gpc.panel.hidden).toBe(true);
    expect(gpc.scripts).toHaveLength(0);

    const narrow = runPreferenceScript({ width: 279, withCmp: true });
    narrow.choose.click();
    narrow.tcfListener()?.(grantedConsent(), true);
    expect(narrow.scripts).toHaveLength(0);
  });

  it("mantém a área responsiva e a G1 sem código publicitário", () => {
    const css = read("public/booking-guide.css");
    const bookingPage = read("src/app/agendar/[slug]/page.tsx");
    const rootLayout = read("src/app/layout.tsx");
    const dashboardLayout = read("src/app/dashboard/layout.tsx");
    const qrPage = read("src/app/dashboard/qr/page.tsx");
    const adapter = read("public/booking-ad-preferences.js");

    expect(css).toContain("max-width: 100%");
    expect(css).toContain("@media");
    expect(css).toContain("overflow: hidden");
    expect(css).not.toContain("width: 300px");
    expect(bookingPage).not.toContain("adsbygoogle");
    expect(bookingPage).not.toContain("pagead2.googlesyndication.com");
    expect(rootLayout).not.toContain("adsbygoogle");
    expect(rootLayout).not.toContain("booking-ad-preferences.js");
    expect(dashboardLayout).not.toContain("adsbygoogle");
    expect(dashboardLayout).not.toContain("booking-ad-preferences.js");
    expect(qrPage).not.toContain("adsbygoogle");
    expect(qrPage).not.toContain("booking-ad-preferences.js");
    expect(adapter).not.toContain("location.assign");
    expect(adapter).not.toContain("location.href =");
    expect(adapter).not.toContain("/consent/booking-cmp.js");
  });
});
