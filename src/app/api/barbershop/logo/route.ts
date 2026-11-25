import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { ImageDecoderUnavailable } from "@/lib/security/image-decoder";
import { limitImageMutation } from "@/lib/security/upload-limit";

import {
  boundedBarbershopLogo,
  maxBarbershopLogoBytes,
} from "@/features/barbershop/logo-image";
import {
  BARBERSHOP_LOGO_BUCKET,
  barbershopLogoVersion,
  isBarbershopLogoObject,
  publicBarbershopLogoUrl,
} from "@/features/barbershop/logo";
import { getActiveDashboardContext } from "@/lib/auth/dal";
import { getAppUrl } from "@/lib/env/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const fail = (message: string, status: number) =>
  Response.json({ message }, { status, headers: noStore });

type LogoDatabase = Awaited<ReturnType<typeof createClient>>;

async function readCurrentLogo(db: LogoDatabase, shopId: string) {
  try {
    const { data, error } = await db
      .from("barbershops")
      .select("logo_url")
      .eq("id", shopId)
      .maybeSingle();

    if (error || !data) return { ok: false as const, value: null };
    return { ok: true as const, value: data.logo_url };
  } catch {
    return { ok: false as const, value: null };
  }
}

function isMissingStorageObject(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const statusCode = (error as { statusCode?: unknown }).statusCode;
  return statusCode === 404 || statusCode === "404";
}

async function drainLogoCleanup(db: LogoDatabase, shopId: string) {
  const storage = createAdminClient().storage.from(BARBERSHOP_LOGO_BUCKET);
  for (let batch = 0; batch < 5; batch++) {
    const pending = await db.rpc("barbershop_logo_cleanup_list", {
      p_barbershop_id: shopId,
    });
    if (pending.error || !Array.isArray(pending.data)) return false;
    if (pending.data.length === 0) return true;

    for (const objectName of pending.data) {
      if (!isBarbershopLogoObject(shopId, objectName)) return false;

      const removal = await storage.remove([objectName]);
      const removed = !removal.error || isMissingStorageObject(removal.error);
      const receipt = await db.rpc("barbershop_logo_cleanup_result", {
        p_barbershop_id: shopId,
        p_object_name: objectName,
        p_removed: removed,
      });

      if (removal.error && !isMissingStorageObject(removal.error)) return false;
      if (receipt.error || receipt.data !== true) return false;
    }
  }

  const remaining = await db.rpc("barbershop_logo_cleanup_list", {
    p_barbershop_id: shopId,
  });
  return !remaining.error && Array.isArray(remaining.data) && remaining.data.length === 0;
}

type LogoAuthorization =
  | { ok: false; response: Response }
  | {
      ok: true;
      db: LogoDatabase;
      shopId: string;
      current: string | null;
      slug: string;
    };

async function authorize(request: Request): Promise<LogoAuthorization> {
  if (request.headers.get("origin") !== getAppUrl()) {
    return { ok: false, response: fail("Origem inválida.", 403) };
  }

  let context;
  let db: LogoDatabase;
  try {
    context = await getActiveDashboardContext();
    if (!context) return { ok: false, response: fail("Sua sessão expirou. Entre novamente.", 401) };
    if (context.active.role !== "owner") {
      return { ok: false, response: fail("Somente o proprietário pode alterar a logo.", 403) };
    }
    db = await createClient();
  } catch {
    return { ok: false, response: fail("Não foi possível validar a sessão da barbearia.", 503) };
  }

  const shopId = context.active.barbershop_id;
  if (request.headers.get("x-logo-shop") !== shopId) {
    return { ok: false, response: fail("A barbearia ativa mudou. Atualize a página.", 409) };
  }
  const lookup = await readCurrentLogo(db, shopId);
  if (!lookup.ok) {
    return { ok: false, response: fail("Não foi possível ler a logo atual. Atualize a página.", 503) };
  }
  const current = lookup.value;

  const suppliedVersion = request.headers.get("x-logo-version");
  if (
    suppliedVersion === null ||
    suppliedVersion.length > 512 ||
    suppliedVersion !== barbershopLogoVersion(current)
  ) {
    return {
      ok: false,
      response: Response.json(
        {
          message: "A logo mudou. Revise a versão atual antes de tentar novamente.",
          logoUrl: publicBarbershopLogoUrl(shopId, current),
          version: barbershopLogoVersion(current),
        },
        { status: 409, headers: noStore },
      ),
    };
  }

  return {
    ok: true,
    db,
    shopId,
    current,
    slug: context.active.barbershop.slug,
  };
}

function revalidateLogoPages(slug: string) {
  revalidatePath("/dashboard", "layout");
  revalidatePath("/dashboard/configuracoes");
  revalidatePath("/dashboard/qr");
  revalidatePath(`/agendar/${slug}`);
}

async function changeLogo(request: Request, remove: boolean): Promise<Response> {
  const authorized = await authorize(request);
  if (!authorized.ok) return authorized.response;
  const { db, shopId, current, slug } = authorized;
  const limited = await limitImageMutation(shopId);
  if (limited) return limited;

  let replacement: string | null = null;
  if (!remove) {
    let image: Buffer;
    try {
      image = await boundedBarbershopLogo(request);
    } catch (error) {
      if (error instanceof ImageDecoderUnavailable) return fail(error.message, 503);
      return fail(
        `Envie um arquivo PNG, JPG ou WebP válido de até ${maxBarbershopLogoBytes / 1024 / 1024} MB.`,
        400,
      );
    }

    replacement = `${shopId}/${randomUUID()}.webp`;
    if (!publicBarbershopLogoUrl(shopId, replacement)) {
      return fail("A URL pública do Storage não está configurada neste ambiente.", 503);
    }
    const storage = createAdminClient().storage.from(BARBERSHOP_LOGO_BUCKET);
    const uploaded = await storage.upload(replacement, image, {
      contentType: "image/webp",
      cacheControl: "31536000",
      upsert: false,
    });

    if (uploaded.error) {
      await retireUnusedLogo(db, shopId, replacement);
      return fail("Não foi possível armazenar a logo. Tente novamente.", 503);
    }
  }

  const changed = await db.rpc("replace_barbershop_logo", {
    p_barbershop_id: shopId,
    p_expected_object: current,
    p_replacement_object: replacement,
  });

  const receipt = changed.data;
  let committed =
    !changed.error &&
    typeof receipt === "object" &&
    receipt !== null &&
    !Array.isArray(receipt) &&
    "current" in receipt &&
    receipt.current === replacement;
  if (!committed && !changed.error?.code?.match(/^[0-9A-Z]{5}$/)) {
    // A transport error can happen after the database committed. The cleanup
    // RPC refuses to queue an object that is currently referenced by the shop.
    const verification = await readCurrentLogo(db, shopId);
    committed = verification.ok && verification.value === replacement;
  }

  if (!committed) {
    if (replacement) {
      await retireUnusedLogo(db, shopId, replacement);
    }
    const code = changed.error?.code;
    if (code === "40001") {
      const latest = await readCurrentLogo(db, shopId);
      if (!latest.ok) return fail("A logo mudou e a versão atual não pôde ser consultada. Atualize a página.", 409);
      return Response.json(
        {
          message: "A logo mudou. Revise a versão atual antes de tentar novamente.",
          logoUrl: publicBarbershopLogoUrl(shopId, latest.value),
          version: barbershopLogoVersion(latest.value),
        },
        { status: 409, headers: noStore },
      );
    }
    if (code === "42501") {
      return fail("Somente o proprietário pode alterar a logo.", 403);
    }
    return fail(
      "Não foi possível confirmar a alteração. Atualize a página antes de repetir.",
      code === "22023" ? 400 : 503,
    );
  }

  const cleanupComplete = await drainLogoCleanup(db, shopId).catch(() => false);
  revalidateLogoPages(slug);

  const message = remove
    ? cleanupComplete
      ? "Logo removida."
      : "Logo removida. A limpeza do arquivo anterior está pendente."
    : cleanupComplete
      ? "Logo atualizada."
      : "Logo atualizada. A limpeza da versão anterior está pendente.";

  return Response.json(
    {
      logoUrl: replacement
        ? publicBarbershopLogoUrl(shopId, replacement)
        : null,
      version: barbershopLogoVersion(replacement),
      message,
    },
    { headers: noStore },
  );
}

async function retireUnusedLogo(db: LogoDatabase, shopId: string, key: string) {
  // The RPC locks the same shop row as replacement. Storage deletion is safe
  // only after the database has retired the key and forbidden reattachment.
  const queued = await db.rpc("barbershop_logo_cleanup_result", {
    p_barbershop_id: shopId,
    p_object_name: key,
    p_removed: false,
  });
  if (!queued.error && queued.data === true) await drainLogoCleanup(db, shopId);
}

export async function POST(request: Request): Promise<Response> {
  try {
    return await changeLogo(request, false);
  } catch {
    return fail("Serviço de logos indisponível. Atualize a página e tente novamente.", 503);
  }
}

export async function DELETE(request: Request): Promise<Response> {
  try {
    return await changeLogo(request, true);
  } catch {
    return fail("Serviço de logos indisponível. Atualize a página e tente novamente.", 503);
  }
}
