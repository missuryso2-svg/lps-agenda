import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronDown,
  CircleCheck,
  Clock3,
  ContactRound,
  CreditCard,
  Fingerprint,
  Layers3,
  LockKeyhole,
  PlayCircle,
  Scissors,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

const features = [
  {
    icon: CalendarDays,
    title: "Agenda sem conflito",
    description:
      "Visão por profissional, bloqueios de horário e status de atendimento em uma rotina simples de operar.",
  },
  {
    icon: UsersRound,
    title: "Equipe com papéis claros",
    description:
      "Proprietário e equipe têm permissões distintas. A regra é aplicada no banco, não apenas na interface.",
  },
  {
    icon: Scissors,
    title: "Serviços do seu jeito",
    description:
      "Duração, preço e profissionais habilitados por serviço, com histórico preservado nos agendamentos.",
  },
  {
    icon: ContactRound,
    title: "Clientes por perto",
    description:
      "Cadastro, contato e histórico para atender melhor sem depender de planilhas paralelas.",
  },
  {
    icon: CreditCard,
    title: "Financeiro preparado",
    description:
      "Estrutura de planos, assinaturas e pagamentos pronta para a integração de cobrança da próxima etapa.",
  },
  {
    icon: ShieldCheck,
    title: "Isolamento entre barbearias",
    description:
      "Cada barbearia acessa somente os próprios dados. Row Level Security ativa em todas as tabelas.",
  },
];

const principles = [
  { icon: Layers3, label: "Isolamento por barbearia" },
  { icon: LockKeyhole, label: "RLS em todas as tabelas" },
  { icon: Fingerprint, label: "Permissões validadas no banco" },
  { icon: Sparkles, label: "Interface em pt-BR" },
];

const steps = [
  {
    number: "01",
    title: "Crie sua conta",
    description:
      "Cadastro com e-mail confirmado e perfil criado automaticamente no primeiro acesso.",
  },
  {
    number: "02",
    title: "Configure a barbearia",
    description:
      "Nome, identificador público, fuso horário e vínculo de proprietário criados na mesma transação.",
  },
  {
    number: "03",
    title: "Organize a operação",
    description:
      "Serviços, equipe e agenda compartilham o mesmo isolamento por barbearia desde a fundação.",
  },
];

const plans = [
  {
    name: "Essencial",
    description: "Para a barbearia que está organizando a base.",
    features: [
      "Agenda e clientes",
      "Catálogo de serviços",
      "Perfil público da barbearia",
      "Um proprietário",
    ],
    highlighted: false,
  },
  {
    name: "Profissional",
    description: "Para operações com equipe e rotina financeira.",
    features: [
      "Tudo do Essencial",
      "Equipe com papéis",
      "Financeiro e assinatura",
      "Relatórios operacionais",
    ],
    highlighted: true,
  },
  {
    name: "Estúdios",
    description: "Para estúdios e redes em expansão.",
    features: [
      "Tudo do Profissional",
      "Múltiplas unidades",
      "Permissões avançadas",
      "Acompanhamento dedicado",
    ],
    highlighted: false,
  },
];

const faq = [
  {
    question: "O LPS Agenda já está disponível?",
    answer:
      "Esta entrega é a fundação técnica do produto: páginas, design system, autenticação e banco preparados. Cadastro, login e painel funcionam quando um projeto Supabase é configurado; agendamento completo e cobrança ainda não estão habilitados.",
  },
  {
    question: "Meus dados ficam separados de outras barbearias?",
    answer:
      "Sim. Todas as tabelas operacionais usam barbershop_id e Row Level Security. O banco verifica o vínculo ativo do usuário antes de liberar qualquer leitura ou escrita.",
  },
  {
    question: "A cobrança de assinatura já está ativa?",
    answer:
      "Não. A estrutura de planos, assinaturas, pagamentos e eventos de webhook está modelada, mas nenhuma integração real com gateway de pagamento foi conectada nesta etapa.",
  },
  {
    question: "O agendamento online do cliente já funciona?",
    answer:
      "A página pública de demonstração apresenta a experiência visual da barbearia. Os botões de agendamento estão identificados como protótipo. O fluxo completo de autoatendimento entra em uma próxima etapa.",
  },
  {
    question: "Consigo usar no celular?",
    answer:
      "Sim. A landing, a autenticação e o painel foram construídos mobile-first, com navegação adaptada para telas pequenas.",
  },
  {
    question: "Como acesso a demonstração?",
    answer:
      "Abra a página da Barbearia Aurora pelo menu Demonstração. Ela usa dados fictícios e está sinalizada como demonstração em toda a interface.",
  },
];

export function LandingPage() {
  return (
    <div className="flex min-h-svh flex-col overflow-x-clip">
      <Hero />
      <TrustStrip />
      <FeaturesSection />
      <FoundationSection />
      <HowItWorksSection />
      <PlansSection />
      <FaqSection />
      <FinalCta />
    </div>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="surface-grain pointer-events-none absolute inset-0 -z-10 opacity-70" />

      <div className="mx-auto grid w-full max-w-7xl items-center gap-16 px-5 pb-24 pt-16 sm:px-8 lg:grid-cols-[1.04fr_0.96fr] lg:gap-12 lg:pb-32 lg:pt-24">
        <div className="animate-rise">
          <div className="inline-flex items-center gap-2 rounded-full border border-gold/30 bg-gold-soft/55 px-3 py-1.5 text-[11px] font-medium tracking-wide text-foreground">
            <span className="size-1.5 rounded-full bg-gold" />
            Plataforma para barbearias · LPS Solutions
          </div>

          <h1 className="mt-7 font-display text-[3.4rem] leading-[0.98] tracking-[-0.035em] text-foreground sm:text-6xl lg:text-[4.6rem]">
            Sua barbearia inteira{" "}
            <span className="text-gold-gradient italic">no ritmo certo.</span>
          </h1>

          <p className="mt-7 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            Agenda, profissionais, clientes e financeiro em uma experiência
            sóbria, rápida e segura. Uma base multiempresa desenhada para a
            operação real da sua barbearia.
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="xl" variant="gold" className="group">
              <Link href="/cadastro">
                Começar agora
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </Button>
            <Button
              asChild
              size="xl"
              variant="outline"
              className="bg-background/65 backdrop-blur"
            >
              <Link href="/barbearia/barbearia-aurora">
                <PlayCircle className="size-4 text-gold" />
                Ver demonstração
              </Link>
            </Button>
          </div>

          <div className="mt-9 flex flex-wrap gap-x-6 gap-y-2.5 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Check className="size-3.5 text-gold" />
              Sem cartão de crédito nesta versão
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Check className="size-3.5 text-gold" />
              Dados isolados por barbearia
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Check className="size-3.5 text-gold" />
              Interface em português
            </span>
          </div>
        </div>

        <DashboardPreview />
      </div>
    </section>
  );
}

function DashboardPreview() {
  return (
    <div className="animate-rise-slow relative mx-auto w-full max-w-[34rem] lg:max-w-none">
      <div className="absolute -inset-8 -z-10 rounded-[3rem] bg-[radial-gradient(ellipse_at_center,oklch(0.71_0.105_79/0.18),transparent_65%)] blur-2xl" />

      <div className="relative rounded-[1.6rem] border border-border/80 bg-card/90 p-2.5 shadow-premium backdrop-blur-sm">
        <div className="flex items-center justify-between rounded-t-[1.1rem] border-b border-border/70 px-3 py-2.5">
          <div className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-destructive/50" />
            <span className="size-2 rounded-full bg-gold/60" />
            <span className="size-2 rounded-full bg-emerald-500/50" />
          </div>
          <span className="text-[9px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
            Prévia visual · dados ilustrativos
          </span>
        </div>

        <div className="p-3 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                Painel · LPS Agenda
              </p>
              <h2 className="mt-1 font-display text-xl tracking-tight">
                Agenda de hoje
              </h2>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-2.5 py-1.5 text-[10px] font-medium text-primary-foreground">
              <span className="text-[13px] leading-none">+</span>
              Novo
            </span>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-2">
            {[
              ["Atendimentos", "08"],
              ["Profissionais", "04"],
              ["Ocupação", "78%"],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-xl border border-border/70 bg-background/50 px-2.5 py-2.5"
              >
                <p className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                  {label}
                </p>
                <p className="mt-1 font-display text-lg leading-none">{value}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 space-y-2">
            {[
              {
                time: "09:00",
                service: "Corte clássico",
                name: "Cliente exemplo",
                badge: "Confirmado",
                tone: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
              },
              {
                time: "10:30",
                service: "Corte + barba",
                name: "Cliente exemplo",
                badge: "Agendado",
                tone: "bg-gold-soft text-foreground",
              },
              {
                time: "13:00",
                service: "Barba completa",
                name: "Cliente exemplo",
                badge: "Agendado",
                tone: "bg-gold-soft text-foreground",
              },
            ].map((item) => (
              <div
                key={item.time}
                className="flex items-center gap-3 rounded-xl border border-border/70 bg-card px-3 py-2.5"
              >
                <span className="w-10 font-mono text-[11px] text-muted-foreground">
                  {item.time}
                </span>
                <span className="h-7 w-px bg-border" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] font-medium">
                    {item.service}
                  </span>
                  <span className="block truncate text-[10px] text-muted-foreground">
                    {item.name} · Profissional exemplo
                  </span>
                </span>
                <span
                  className={`hidden rounded-md px-1.5 py-0.5 text-[9px] font-medium sm:inline ${item.tone}`}
                >
                  {item.badge}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-between rounded-xl border border-dashed border-border px-3 py-2.5">
            <span className="inline-flex items-center gap-2 text-[10px] text-muted-foreground">
              <Clock3 className="size-3.5 text-gold" />
              Próximo horário livre · 14:30
            </span>
            <span className="text-[10px] font-medium text-gold">Ver agenda</span>
          </div>
        </div>
      </div>

      <div className="absolute -bottom-6 -left-3 hidden items-center gap-2.5 rounded-2xl border border-border/80 bg-card px-3.5 py-3 shadow-premium sm:flex">
        <span className="grid size-8 place-items-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
          <CircleCheck className="size-4" />
        </span>
        <span>
          <span className="block text-[11px] font-medium">Horário confirmado</span>
          <span className="block text-[9px] text-muted-foreground">
            Sem conflito na agenda
          </span>
        </span>
      </div>
    </div>
  );
}

function TrustStrip() {
  return (
    <section className="border-y border-border/70 bg-card/45">
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-center gap-x-10 gap-y-4 px-5 py-5 sm:px-8">
        {principles.map((principle) => (
          <span
            key={principle.label}
            className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground"
          >
            <principle.icon className="size-3.5 text-gold" />
            {principle.label}
          </span>
        ))}
      </div>
    </section>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.26em] text-gold">
      <span className="h-px w-6 bg-gold/70" />
      {children}
    </span>
  );
}

function FeaturesSection() {
  return (
    <section id="recursos" className="scroll-mt-24">
      <div className="mx-auto w-full max-w-7xl px-5 py-24 sm:px-8 lg:py-28">
        <div className="max-w-2xl">
          <SectionLabel>Recursos</SectionLabel>
          <h2 className="mt-5 font-display text-4xl leading-[1.05] tracking-[-0.03em] sm:text-5xl">
            Tudo o que a operação pede.
            <span className="block text-muted-foreground">Sem ruído.</span>
          </h2>
          <p className="mt-5 text-sm leading-relaxed text-muted-foreground sm:text-base">
            A plataforma foi desenhada em torno da rotina de uma barbearia: tempo,
            pessoas e dinheiro. Cada área tem uma responsabilidade clara — e o
            banco de dados sustenta as regras.
          </p>
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <article
              key={feature.title}
              className="group relative overflow-hidden rounded-2xl border border-border/80 bg-card/70 p-6 transition-all duration-300 hover:-translate-y-0.5 hover:border-gold/40 hover:shadow-premium"
            >
              <div className="absolute -right-10 -top-10 size-28 rounded-full bg-gold/5 blur-2xl transition-opacity group-hover:opacity-100" />
              <span className="grid size-11 place-items-center rounded-xl border border-gold/20 bg-gold-soft/60 text-gold">
                <feature.icon className="size-5" />
              </span>
              <h3 className="mt-5 font-display text-xl tracking-tight">
                {feature.title}
              </h3>
              <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">
                {feature.description}
              </p>
            </article>
          ))}
        </div>

        <p className="mt-8 text-xs text-muted-foreground">
          Parte dos fluxos está em construção. A fundação de dados, permissões e
          interface já está disponível.
        </p>
      </div>
    </section>
  );
}

function FoundationSection() {
  return (
    <section className="relative overflow-hidden bg-[oklch(0.185_0.006_65)] text-white">
      <div className="pointer-events-none absolute inset-0 opacity-30">
        <div className="absolute -left-32 top-10 size-[28rem] rounded-full bg-gold/20 blur-[120px]" />
        <div className="absolute -right-24 bottom-0 size-[22rem] rounded-full bg-white/5 blur-[100px]" />
      </div>

      <div className="relative mx-auto grid w-full max-w-7xl gap-14 px-5 py-24 sm:px-8 lg:grid-cols-[1fr_0.92fr] lg:items-center lg:py-28">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-gold/25 bg-gold/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-gold">
            <ShieldCheck className="size-3.5" />
            Fundação técnica
          </span>

          <h2 className="mt-6 max-w-xl font-display text-4xl leading-[1.05] tracking-[-0.03em] sm:text-5xl">
            Não é só uma tela bonita. É uma operação{" "}
            <span className="text-gold-gradient italic">isolada por barbearia.</span>
          </h2>

          <p className="mt-6 max-w-xl text-sm leading-relaxed text-white/55 sm:text-base">
            A barbearia é a raiz de todo o domínio. Vínculos, permissões e
            políticas de acesso vivem no PostgreSQL — não apenas em condicionais
            de front-end.
          </p>

          <ul className="mt-8 space-y-4">
            {[
              "Todas as tabelas operacionais carregam barbershop_id.",
              "Proprietário e equipe têm papéis distintos, com trigger contra autopromoção.",
              "Administrador global é definido apenas em app_metadata do JWT.",
              "Auditoria de mutações sensíveis e grants explícitos por tabela.",
            ].map((item) => (
              <li key={item} className="flex items-start gap-3 text-sm text-white/70">
                <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border border-gold/30 bg-gold/10 text-gold">
                  <Check className="size-3" />
                </span>
                {item}
              </li>
            ))}
          </ul>

          <div className="mt-9">
            <Button
              asChild
              variant="outline"
              size="xl"
              className="border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"
            >
              <Link href="/cadastro">
                Criar minha conta
                <ArrowUpRight className="size-4 text-gold" />
              </Link>
            </Button>
          </div>
        </div>

        <div className="grid gap-3">
          {[
            {
              icon: Layers3,
              title: "Banco de dados",
              text: "17 tabelas, enums, FKs compostas, índices e constraints de sobreposição.",
              code: "barbershop_id · RLS · audit_logs",
            },
            {
              icon: Fingerprint,
              title: "Permissões",
              text: "Papéis validados por funções SECURITY DEFINER e políticas por operação.",
              code: "owner | staff | platform_admin",
            },
            {
              icon: LockKeyhole,
              title: "Segredos",
              text: "Service role e token do gateway ficam restritos ao servidor.",
              code: "server-only · nunca no browser",
            },
          ].map((card) => (
            <article
              key={card.title}
              className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 backdrop-blur-sm"
            >
              <div className="flex items-center gap-3">
                <span className="grid size-9 place-items-center rounded-lg border border-gold/25 bg-gold/10 text-gold">
                  <card.icon className="size-4" />
                </span>
                <h3 className="font-display text-lg">{card.title}</h3>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-white/50">
                {card.text}
              </p>
              <code className="mt-4 block rounded-lg border border-white/10 bg-black/20 px-3 py-2 font-mono text-[10px] text-gold/80">
                {card.code}
              </code>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorksSection() {
  return (
    <section id="como-funciona" className="scroll-mt-24">
      <div className="mx-auto w-full max-w-7xl px-5 py-24 sm:px-8 lg:py-28">
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div className="max-w-xl">
            <SectionLabel>Como funciona</SectionLabel>
            <h2 className="mt-5 font-display text-4xl leading-[1.05] tracking-[-0.03em] sm:text-5xl">
              Do primeiro acesso à
              <span className="block text-muted-foreground">barbearia organizada.</span>
            </h2>
          </div>
          <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
            O onboarding cria a barbearia e o vínculo de proprietário em uma única
            transação. Sem etapas soltas, sem registros órfãos.
          </p>
        </div>

        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {steps.map((step, index) => (
            <article
              key={step.number}
              className="relative rounded-2xl border border-border/80 bg-card/60 p-6"
            >
              <span className="font-display text-4xl text-gold/30">
                {step.number}
              </span>
              <h3 className="mt-5 font-display text-xl">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {step.description}
              </p>
              {index < steps.length - 1 ? (
                <ArrowRight className="absolute -right-3 top-1/2 hidden size-5 -translate-y-1/2 text-border md:block" />
              ) : null}
            </article>
          ))}
        </div>

        <div className="mt-6 flex items-start gap-2 rounded-xl border border-dashed border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
          <Sparkles className="mt-0.5 size-3.5 shrink-0 text-gold" />
          Convites de equipe e agendamento completo estão previstos para a próxima
          etapa. A estrutura de dados e permissões já existe.
        </div>
      </div>
    </section>
  );
}

function PlansSection() {
  return (
    <section id="planos" className="scroll-mt-24 border-y border-border/70 bg-card/35">
      <div className="mx-auto w-full max-w-7xl px-5 py-24 sm:px-8 lg:py-28">
        <div className="mx-auto max-w-2xl text-center">
          <SectionLabel>Planos</SectionLabel>
          <h2 className="mt-5 font-display text-4xl leading-[1.05] tracking-[-0.03em] sm:text-5xl">
            Uma base para cada
            <span className="block text-muted-foreground">momento da barbearia.</span>
          </h2>
          <p className="mt-5 text-sm leading-relaxed text-muted-foreground">
            Referências de produto para a próxima fase. A cobrança ainda não está
            ativa nesta versão.
          </p>
        </div>

        <div className="mt-12 grid gap-4 lg:grid-cols-3">
          {plans.map((plan) => (
            <article
              key={plan.name}
              className={`relative flex flex-col rounded-2xl border p-6 transition-shadow ${
                plan.highlighted
                  ? "border-gold/45 bg-card shadow-premium"
                  : "border-border/80 bg-card/60"
              }`}
            >
              {plan.highlighted ? (
                <span className="absolute -top-3 left-6 rounded-full bg-gold px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-gold-foreground">
                  Mais indicado
                </span>
              ) : null}

              <h3 className="font-display text-2xl">{plan.name}</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                {plan.description}
              </p>

              <div className="mt-6 flex items-end gap-1.5">
                <span className="font-display text-3xl tracking-tight">
                  Sob consulta
                </span>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Valores definidos na etapa comercial.
              </p>

              <Separator className="my-6" />

              <ul className="flex-1 space-y-3">
                {plan.features.map((feature) => (
                  <li
                    key={feature}
                    className="flex items-start gap-2.5 text-sm text-muted-foreground"
                  >
                    <Check className="mt-0.5 size-3.5 shrink-0 text-gold" />
                    {feature}
                  </li>
                ))}
              </ul>

              <Button
                asChild
                size="xl"
                variant={plan.highlighted ? "gold" : "outline"}
                className="mt-7 w-full"
              >
                <Link href="/cadastro">Começar agora</Link>
              </Button>
            </article>
          ))}
        </div>

        <p className="mt-8 text-center text-[11px] text-muted-foreground">
          O LPS Agenda não processa pagamentos nesta versão. Nenhuma cobrança será
          realizada.
        </p>
      </div>
    </section>
  );
}

function FaqSection() {
  return (
    <section id="faq" className="scroll-mt-24">
      <div className="mx-auto grid w-full max-w-7xl gap-12 px-5 py-24 sm:px-8 lg:grid-cols-[0.8fr_1.2fr] lg:py-28">
        <div>
          <SectionLabel>Perguntas frequentes</SectionLabel>
          <h2 className="mt-5 font-display text-4xl leading-[1.05] tracking-[-0.03em] sm:text-5xl">
            Antes de
            <span className="block text-muted-foreground">começar.</span>
          </h2>
          <p className="mt-5 max-w-sm text-sm leading-relaxed text-muted-foreground">
            Transparência sobre o que já existe nesta entrega e o que ainda está
            em construção.
          </p>
        </div>

        <div className="divide-y divide-border/80 border-y border-border/80">
          {faq.map((item) => (
            <details key={item.question} className="group py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-medium text-foreground [&::-webkit-details-marker]:hidden">
                {item.question}
                <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180" />
              </summary>
              <p className="pt-3 text-sm leading-relaxed text-muted-foreground">
                {item.answer}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="px-5 pb-4 sm:px-8">
      <div className="relative mx-auto w-full max-w-7xl overflow-hidden rounded-[2rem] border border-gold/25 bg-[oklch(0.94_0.035_86)] px-6 py-14 dark:bg-[oklch(0.245_0.03_78)] sm:px-12 lg:px-16">
        <div className="pointer-events-none absolute -right-20 -top-24 size-72 rounded-full border border-gold/20" />
        <div className="pointer-events-none absolute -bottom-28 -right-10 size-80 rounded-full border border-gold/15" />

        <div className="relative flex flex-col items-start justify-between gap-8 lg:flex-row lg:items-center">
          <div className="max-w-xl">
            <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-gold">
              LPS Agenda
            </p>
            <h2 className="mt-4 font-display text-4xl leading-[1.05] tracking-[-0.03em] sm:text-5xl">
              Coloque a operação
              <span className="block italic text-gold-gradient">no ritmo certo.</span>
            </h2>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground">
              Crie sua conta, configure a barbearia e conheça a fundação do
              produto. A interface é real; cobrança e agendamento completo ainda
              não estão ativos.
            </p>
          </div>

          <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-56">
            <Button asChild size="xl" variant="gold" className="w-full">
              <Link href="/cadastro">
                Criar conta
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button asChild size="xl" variant="outline" className="w-full bg-background/40">
              <Link href="/login">Já tenho conta</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
