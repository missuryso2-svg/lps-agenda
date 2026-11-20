import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { boundedPhoto } from "@/features/barbers/photo";
import { getActiveDashboardContext } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { getAppUrl } from "@/lib/env/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { barberIdSchema } from "@/lib/validation/barbers";

const bucket = "barber-photos";
type Params = { params: Promise<{ id: string }> };
const fail = (message: string, status: number) =>
  Response.json(
    { message },
    { status, headers: { "Cache-Control": "no-store" } },
  );

async function profile(params: Params) {
  const { id } = await params.params;
  const ctx = await getActiveDashboardContext();
  if (!ctx || !barberIdSchema.safeParse(id).success) return null;
  const shop = ctx.active.barbershop.id;
  const db = await createClient();
  const { data } = await db
    .from("barbers")
    .select("avatar_url")
    .eq("id", id)
    .eq("barbershop_id", shop)
    .maybeSingle();
  return data ? { db, id, shop, ctx, previous: data.avatar_url } : null;
}

export async function GET(_req: Request, params: Params) {
  const row = await profile(params);
  if (!row?.previous?.startsWith(row.shop + "/" + row.id + "/"))
    return fail("Foto indisponível.", 404);
  const { data, error } = await row.db.storage
    .from(bucket)
    .download(row.previous);
  if (!data || error) return fail("Foto indisponível.", 404);
  return new Response(data, {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function change(req: Request, params: Params, remove: boolean) {
  if (
    !req.headers.has("x-photo-version") ||
    req.headers.get("origin") !== getAppUrl()
  )
    return fail("Origem inválida.", 403);
  const row = await profile(params);
  if (!row || row.ctx.active.role !== "owner")
    return fail("Acesso restrito ao proprietário.", 403);
  if (
    req.headers.get("x-photo-version") !==
    encodeURIComponent(row.previous ?? "")
  )
    return fail("A foto mudou. Atualize a equipe.", 409);
  const admin = createAdminClient(),
    storage = admin.storage.from(bucket);
  const prefix = row.shop + "/" + row.id + "/";
  let key: string | null = null;
  if (!remove) {
    let image: Buffer;
    try {
      image = await boundedPhoto(req);
    } catch {
      return fail(
        "Envie uma foto JPG, PNG ou WebP de até 2 MB e 16 megapixels.",
        400,
      );
    }
    key = prefix + randomUUID() + ".webp";
    const { error } = await storage.upload(key, image, {
      contentType: "image/webp",
      upsert: false,
    });
    if (error) return fail("Não foi possível armazenar a foto.", 503);
  }
  const result = await admin.rpc("replace_barber_photo", {
    actor: row.ctx.user.id,
    shop: row.shop,
    professional: row.id,
    previous: row.previous,
    replacement: key,
  });
  // On an ambiguous transport failure keep the object: the database may have committed.
  if (result.error) {
    if (key && ["42501", "22023"].includes(result.error.code))
      await storage.remove([key]);
    return fail(
      "Não foi possível confirmar a alteração. Atualize a equipe.",
      result.error.code === "42501" ? 403 : 503,
    );
  }
  if (!result.data) {
    if (key) await storage.remove([key]);
    return fail("A foto mudou. Atualize a equipe.", 409);
  }
  let cleanupPending = false;
  if (row.previous?.startsWith(prefix))
    cleanupPending = Boolean((await storage.remove([row.previous])).error);
  revalidatePath("/dashboard/equipe");
  return Response.json({
    key,
    message: cleanupPending
      ? "Foto atualizada. A limpeza da versão anterior está pendente."
      : remove
        ? "Foto removida."
        : "Foto atualizada.",
  });
}
export const POST = (req: Request, params: Params) =>
  change(req, params, false);
export const DELETE = (req: Request, params: Params) =>
  change(req, params, true);
