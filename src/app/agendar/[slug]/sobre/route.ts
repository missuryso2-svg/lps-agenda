import type { NextRequest } from "next/server";

import { isPublicBookingConfigured } from "@/features/public-booking/config";
import { businessHoursByDay } from "@/features/public-booking/format";
import { getPublicBookingPage } from "@/features/public-booking/queries";
import {
  adPlacement,
  contentRevision,
  hasGuideContent,
} from "@/features/monetization/placement";
import { publicSlugSchema } from "@/lib/validation/public-booking";

export const dynamic = "force-dynamic";

const responseHeaders = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy":
    "frame-ancestors 'none'; base-uri 'none'; form-action 'none'; object-src 'none'",
};

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function unavailable(status: number): Response {
  return new Response("Ficha pública indisponível.", {
    status,
    headers: responseHeaders,
  });
}

// A standalone document keeps the optional ad runtime out of the booking form
// and avoids injecting third-party scripts into App Router navigation.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const { slug } = await params;
  const parsed = publicSlugSchema.safeParse(slug);

  if (
    !parsed.success ||
    parsed.data !== slug ||
    request.nextUrl.search ||
    !isPublicBookingConfigured()
  ) {
    return unavailable(404);
  }

  const result = await getPublicBookingPage(slug);

  if (result.status !== "ready") {
    return unavailable(result.status === "error" ? 503 : 404);
  }

  if (!hasGuideContent(result.data)) {
    return unavailable(404);
  }

  const hasSession = request.cookies
    .getAll()
    .some((cookie) => /^sb-.*-auth-token(?:\.\d+)?$/.test(cookie.name));
  const placement = hasSession
    ? null
    : adPlacement(result.data, process.env, process.env.NEXT_PUBLIC_APP_URL);
  const { barbershop, services, businessHours } = result.data;
  const escapedName = escapeHtml(barbershop.name);
  const escapedDescription = escapeHtml(barbershop.description?.trim() ?? "");
  const booking = `/agendar/${parsed.data}`;
  const preferences = placement
    ? `<section aria-label="Preferências de publicidade" id="preferences"
        data-origin="${escapeHtml(placement.origin)}"
        data-page="${booking}/sobre"
        data-publisher="${placement.publisher}"
        data-slot="${placement.slot}"
        data-cmp="${placement.cmp}" hidden>
        <p>A publicidade é opcional. Você pode consultar esta ficha e agendar sem ativar anúncios.</p>
        <button id="choose" type="button">Preferências de publicidade</button>
        <button id="decline" type="button">Continuar sem publicidade nesta visita</button>
        <p id="choice-status" role="status" aria-live="polite"></p>
      </section>`
    : "";
  const adArea = placement
    ? '<aside id="advertising" aria-label="Publicidade" hidden></aside><script defer src="/booking-ad-preferences.js"></script>'
    : "";
  const serviceList = services
    .map(
      (service) => `<div>
        <dt>${escapeHtml(service.name)} <small>· ${service.durationMinutes} min</small></dt>
        <dd>${escapeHtml(service.description?.trim() ?? "")}</dd>
      </div>`,
    )
    .join("");
  const hoursList = businessHoursByDay(businessHours)
    .map(
      (hours) => `<div><dt>${escapeHtml(hours.label)}</dt><dd>${escapeHtml(hours.hours)}</dd></div>`,
    )
    .join("");

  const html = `<!doctype html>
  <html lang="pt-BR">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <meta name="referrer" content="no-referrer">
      <meta name="description" content="${escapedDescription}">
      <title>${escapedName} · LPS Agenda</title>
      <link rel="stylesheet" href="/booking-guide.css">
    </head>
    <body>
      <main>
        <header>
          <a class="brand" href="/">LPS Agenda</a>
          <a href="/privacidade">Privacidade</a>
        </header>
        <article>
          <h1>${escapedName}</h1>
          <p class="intro">${escapedDescription}</p>
          <a class="booking" href="${booking}" rel="noreferrer">Consultar horários para agendar</a>
          <h2>Serviços</h2>
          <dl>${serviceList}</dl>
          <h2>Funcionamento</h2>
          <dl class="hours">${hoursList}</dl>
        </article>
        ${preferences}
        ${adArea}
        <footer><a href="${booking}" rel="noreferrer">Voltar ao agendamento</a></footer>
      </main>
    </body>
  </html>`;

  return new Response(html, {
    headers: {
      ...responseHeaders,
      "X-LPS-Content-Revision": contentRevision(result.data),
    },
  });
}
