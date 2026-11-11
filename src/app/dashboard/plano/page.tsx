import {
  Check,
  CheckCircle2,
  CreditCard,
  FileClock,
  LockKeyhole,
  ReceiptText,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type { Metadata } from "next";

import { DashboardEmpty } from "@/components/dashboard/dashboard-empty";
import { NoticeCard } from "@/components/dashboard/notice-card";
import { PageHeader } from "@/components/dashboard/page-header";
import {
  PrototypeBadge,
  SubscriptionStatusBadge,
} from "@/components/dashboard/status-badge";
import { PrototypeAction } from "@/components/prototype-action";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getPlans, getSubscription } from "@/features/dashboard/queries";
import { requireOwnerDashboardContext } from "@/lib/auth/dal";
import { formatCurrencyFromCents, formatDateBR } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Plano e assinatura",
};

const referencePlans = [
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

export default async function PlanPage() {
  const context = await requireOwnerDashboardContext();
  const shop = context.active.barbershop;

  const [subscription, plans] = await Promise.all([
    getSubscription(shop.id),
    getPlans(),
  ]);

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Gestão"
        title="Plano e assinatura"
        description="A estrutura de cobrança está modelada no banco. Nenhum cartão é cobrado e nenhum gateway está conectado nesta fundação."
        actions={
          <PrototypeAction
            triggerLabel="Central de planos"
            triggerVariant="gold"
            triggerSize="lg"
            title="Central de planos"
            description="A contratação e a troca de plano ainda não estão disponíveis. Os planos exibidos abaixo são referências de produto, sem cobrança."
            steps={[
              {
                title: "Escolha do plano",
                description:
                  "Comparação de limites, recursos e valor mensal.",
              },
              {
                title: "Checkout seguro",
                description:
                  "Cobrança criada no servidor e confirmação por webhook.",
              },
              {
                title: "Gestão da assinatura",
                description:
                  "Upgrade, downgrade e cancelamento com histórico.",
              },
            ]}
            footnote="Este modal não abre checkout externo nem coleta dados de pagamento."
          />
        }
      />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 border-b border-border/70 pb-4">
          <div>
            <CardTitle className="flex flex-wrap items-center gap-2">
              Assinatura atual
              <PrototypeBadge label="Cobrança inativa" />
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              O vínculo atual desta barbearia com a tabela de assinaturas.
            </p>
          </div>
          {subscription ? (
            <SubscriptionStatusBadge status={subscription.subscription.status} />
          ) : (
            <Badge variant="outline" className="border-border bg-muted/50 text-muted-foreground">
              Sem assinatura
            </Badge>
          )}
        </CardHeader>
        <CardContent>
          {subscription ? (
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Plano
                </p>
                <p className="mt-1 font-display text-xl">
                  {subscription.plan?.name ?? "Plano vinculado"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {subscription.plan
                    ? formatCurrencyFromCents(subscription.plan.price_cents)
                    : "Valor não definido"}
                  {subscription.plan?.interval === "year" ? " / ano" : " / mês"}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Período atual
                </p>
                <p className="mt-1 text-sm">
                  {subscription.subscription.current_period_start
                    ? formatDateBR(
                        subscription.subscription.current_period_start,
                        shop.timezone,
                      )
                    : "Não iniciado"}
                  {" → "}
                  {subscription.subscription.current_period_end
                    ? formatDateBR(
                        subscription.subscription.current_period_end,
                        shop.timezone,
                      )
                    : "Em aberto"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Renovação automática:{" "}
                  {subscription.subscription.cancel_at_period_end
                    ? "cancelada"
                    : "prevista"}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Integração de pagamento
                </p>
                <p className="mt-1 text-sm capitalize">
                  {subscription.subscription.gateway}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Estrutura preparada, integração não conectada.
                </p>
              </div>
            </div>
          ) : (
            <DashboardEmpty
              className="border-0 bg-transparent py-6"
              icon={CreditCard}
              title="Nenhuma assinatura vinculada"
              description="Sua barbearia ainda não possui um plano ativo. Nenhuma cobrança será feita enquanto a integração financeira não for habilitada."
              action={
                <PrototypeAction
                  triggerLabel="Como a assinatura funcionará"
                  triggerSize="sm"
                  title="Assinatura na próxima etapa"
                  description="O fluxo de contratação será construído sobre as tabelas plans, subscriptions e payments."
                  steps={[
                    {
                      title: "Plano escolhido",
                      description:
                        "Registro da assinatura com status de teste ou ativo.",
                    },
                    {
                      title: "Cobrança no servidor",
                      description:
                        "Gateway acessado apenas por rotas protegidas.",
                    },
                    {
                      title: "Evento confirmado",
                      description:
                        "Webhook idempotente atualiza o status da assinatura.",
                    },
                  ]}
                />
              }
            />
          )}
        </CardContent>
      </Card>

      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-display text-xl tracking-tight">
              {plans.length > 0 ? "Planos disponíveis" : "Planos de referência"}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {plans.length > 0
                ? "Catálogo lido da tabela plans."
                : "Estrutura de produto desta fundação, sem valores comerciais definidos."}
            </p>
          </div>
          {plans.length === 0 ? (
            <PrototypeBadge label="Valores em definição" />
          ) : null}
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {(plans.length > 0 ? plans : referencePlans).map((plan) => {
            const isDatabasePlan = "code" in plan;
            const features = isDatabasePlan
              ? Array.isArray(plan.features)
                ? plan.features.filter(
                    (feature): feature is string => typeof feature === "string",
                  )
                : []
              : plan.features;
            const highlighted = isDatabasePlan
              ? plan.code === "profissional"
              : plan.highlighted;

            return (
              <Card
                key={isDatabasePlan ? plan.id : plan.name}
                className={cn(
                  "relative",
                  highlighted && "border-gold/35 bg-gold-soft/15 shadow-premium",
                )}
              >
                {highlighted ? (
                  <span className="absolute right-3 top-3">
                    <Badge
                      variant="outline"
                      className="border-gold/35 bg-gold-soft/60 text-[9px] uppercase tracking-[0.12em]"
                    >
                      Destaque
                    </Badge>
                  </span>
                ) : null}
                <CardHeader>
                  <CardTitle className="font-display text-xl">
                    {plan.name}
                  </CardTitle>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {plan.description ?? "Plano da plataforma LPS Agenda."}
                  </p>
                  <p className="mt-2 font-display text-2xl">
                    {isDatabasePlan
                      ? formatCurrencyFromCents(plan.price_cents)
                      : "Em definição"}
                    {isDatabasePlan ? (
                      <span className="ml-1 text-xs font-sans text-muted-foreground">
                        {plan.interval === "year" ? "/ ano" : "/ mês"}
                      </span>
                    ) : null}
                  </p>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {features.map((feature) => (
                      <li
                        key={feature}
                        className="flex items-start gap-2 text-xs text-muted-foreground"
                      >
                        <Check className="mt-0.5 size-3.5 shrink-0 text-gold" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  {isDatabasePlan && plan.max_barbers ? (
                    <p className="mt-4 border-t border-border/70 pt-3 text-[10px] text-muted-foreground">
                      Até {plan.max_barbers} profissional(is) por barbearia.
                    </p>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CheckCircle2 className="size-4 text-gold" />
              O que já está pronto
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs text-muted-foreground">
            {[
              "Tabelas de planos, assinaturas, pagamentos e eventos de webhook",
              "RLS com leitura limitada à barbearia e escrita administrativa",
              "Status de assinatura e pagamento modelados por enums",
              "Chaves de gateway previstas apenas no servidor",
            ].map((item) => (
              <p key={item} className="flex items-start gap-2">
                <Check className="mt-0.5 size-3.5 shrink-0 text-gold" />
                {item}
              </p>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileClock className="size-4 text-gold" />
              Próxima etapa
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs text-muted-foreground">
            {[
              "Integração server-side com o gateway de pagamento",
              "Checkout, upgrade, downgrade e cancelamento",
              "Processamento idempotente de webhooks",
              "Histórico financeiro e recibos",
            ].map((item) => (
              <p key={item} className="flex items-start gap-2">
                <span className="mt-1.5 size-1 shrink-0 rounded-full bg-gold" />
                {item}
              </p>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <NoticeCard icon={ShieldCheck} title="Cobrança sob controle" tone="gold">
          Nenhuma integração externa é simulada. O botão de planos apenas
          explica a arquitetura e não abre checkout.
        </NoticeCard>
        <NoticeCard icon={LockKeyhole} title="Segredos fora do cliente">
          `ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN` e
          `SUPABASE_SERVICE_ROLE_KEY` permanecem restritas ao servidor em toda a
          arquitetura.
        </NoticeCard>
      </div>

      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <Sparkles className="size-3.5 text-gold" />
        <ReceiptText className="size-3.5 text-muted-foreground" />
        Estrutura de billing pronta para integração futura.
      </div>
    </div>
  );
}
