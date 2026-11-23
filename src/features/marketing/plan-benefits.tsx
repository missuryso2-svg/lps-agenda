import {
  CalendarDays,
  UsersRound,
  ContactRound,
  Wallet,
  LayoutDashboard,
} from "lucide-react";

export const trialOffer =
  "Teste de 168 horas no plano Básico, sujeito à liberação pela LPS Solutions.";
export const trialTerms =
  "Confirme a disponibilidade antes de criar sua barbearia. Quando liberado, começa com 1 profissional ativo.";
const benefits = [
  [
    CalendarDays,
    "Agenda e horários",
    "Organize horários e pausas por barbeiro. Agende clientes presenciais, confirme novas reservas e consulte o histórico da agenda.",
  ],
  [
    UsersRound,
    "Equipe e serviços",
    "Cadastre profissionais, edite perfis com foto e escolha os serviços que cada pessoa atende.",
  ],
  [
    ContactRound,
    "Clientes",
    "Mantenha os cadastros e contatos da barbearia atualizados e abra uma conversa individual pelo WhatsApp.",
  ],
  [
    Wallet,
    "Recebimentos de serviços",
    "Acompanhe os recebimentos dos atendimentos da barbearia no painel financeiro de serviços.",
  ],
  [
    LayoutDashboard,
    "Gestão da operação",
    "Acompanhe a rotina no dashboard, consulte as avaliações registradas pela equipe e compartilhe o link de agendamento.",
  ],
] as const;

export function PlanBenefits() {
  return (
    <section className="mt-8">
      <h3 className="font-display text-xl font-semibold">
        Incluído em todos os planos
      </h3>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {benefits.map(([Icon, title, body]) => (
          <article
            key={title}
            className="rounded-xl border border-border bg-card p-4"
          >
            <Icon className="mb-3 size-5 text-gold" aria-hidden />
            <h4 className="text-sm font-semibold">{title}</h4>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              {body}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
