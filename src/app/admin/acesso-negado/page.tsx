import Link from "next/link";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Acesso negado",
  robots: { index: false, follow: false },
};
export default function Denied() {
  return (
    <main className="mx-auto max-w-lg px-6 py-24">
      <p className="text-sm text-muted-foreground">LPS Solutions</p>
      <h1 className="my-4 font-display text-4xl">Acesso financeiro negado</h1>
      <p>
        Esta conta não possui a permissão necessária para acessar a área
        solicitada.
      </p>
      <Link className="mt-6 inline-block underline" href="/">
        Voltar ao início
      </Link>
    </main>
  );
}
