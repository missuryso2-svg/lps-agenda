import Link from "next/link";
import { redirect } from "next/navigation";
import { financialSession } from "@/lib/auth/financial-admin";
import { TotpForm } from "./totp-form";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Confirmação em duas etapas · LPS Solutions",
  robots: { index: false, follow: false },
};

export default async function FinancialMfaPage() {
  const session = await financialSession();
  if (session.status === "anonymous") redirect("/login?proximo=%2Fadmin%2Fassinaturas");
  if (session.status === "denied") redirect("/admin/acesso-negado");
  if (session.status === "authorized") redirect("/admin/assinaturas");

  const { data, error } = await session.db.auth.mfa.listFactors();
  const factors = data?.totp.map((factor, index) => ({
    id: factor.id,
    label: factor.friendly_name || `Autenticador ${index + 1}`,
  })) ?? [];
  return (
    <main className="mx-auto max-w-lg px-6 py-24">
      <p className="text-sm text-muted-foreground">LPS Solutions</p>
      <h1 className="my-4 font-display text-4xl">Confirmação em duas etapas</h1>
      {error ? <p>Não foi possível consultar os autenticadores. Atualize a página e tente novamente.</p>
        : factors.length ? <TotpForm factors={factors} />
        : <p>Solicite ao gestor a configuração ou recuperação do autenticador financeiro.</p>}
      <Link className="mt-6 inline-block underline" href="/">Voltar ao início</Link>
    </main>
  );
}
