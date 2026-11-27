import type { AuthError } from "@supabase/supabase-js";

const messages: Record<string, string> = {
  invalid_credentials: "E-mail ou senha inválidos.",
  email_not_confirmed: "Confirme seu e-mail antes de entrar.",
  weak_password: "A senha não atende aos requisitos mínimos de segurança.",
  over_email_send_rate_limit:
    "Muitos e-mails enviados em pouco tempo. Aguarde alguns minutos e tente novamente.",
  over_request_rate_limit:
    "Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.",
  too_many_requests:
    "Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.",
  session_not_found: "Sua sessão expirou. Entre novamente.",
  same_password: "A nova senha precisa ser diferente da senha atual.",
};

const fallbackMessage =
  "Não foi possível concluir a operação agora. Tente novamente em instantes.";

export function authErrorMessage(error: AuthError | null | undefined): string {
  if (!error) {
    return fallbackMessage;
  }

  if (error.code && messages[error.code]) {
    return messages[error.code];
  }

  return fallbackMessage;
}

export function isMissingSupabaseConfigMessage(message: string): boolean {
  return message.toLowerCase().includes("supabase não configurado");
}
