import { NextResponse, type NextRequest } from "next/server";

import { getSupabasePublicEnv } from "@/lib/env/public";
import { safeNextPath } from "@/lib/navigation";
import { createClient } from "@/lib/supabase/server";

const otpTypes = [
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
] as const;

type OtpType = (typeof otpTypes)[number];

function isOtpType(value: string | null): value is OtpType {
  return value !== null && (otpTypes as readonly string[]).includes(value);
}

function loginError(request: NextRequest, message: string) {
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  url.searchParams.set("erro", message);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const providerError = searchParams.get("error_description");
  if (providerError) {
    return loginError(
      request,
      "Não foi possível validar o link. Solicite um novo e-mail e tente novamente.",
    );
  }

  if (!getSupabasePublicEnv()) {
    return loginError(
      request,
      "Supabase não configurado neste ambiente. Consulte o README para configurar as variáveis.",
    );
  }

  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const next = safeNextPath(
    searchParams.get("next") ?? searchParams.get("proximo"),
    "/dashboard",
  );

  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(new URL(next, request.nextUrl.origin));
    }
  }

  if (tokenHash && isOtpType(type)) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });

    if (!error) {
      return NextResponse.redirect(new URL(next, request.nextUrl.origin));
    }
  }

  return loginError(
    request,
    "O link expirou ou já foi utilizado. Solicite um novo e-mail e tente novamente.",
  );
}
