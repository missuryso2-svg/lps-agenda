"use client";

import {
  ArrowLeftRight,
  BadgeCheck,
  CalendarClock,
  FileClock,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useState } from "react";

import { DashboardEmpty } from "@/components/dashboard/dashboard-empty";
import { NoticeCard } from "@/components/dashboard/notice-card";
import { SubscriptionStatusBadge } from "@/components/dashboard/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BILLING_TYPE_LABELS } from "@/lib/validation/billing";
import { LegacyInvoices } from "./legacy-invoices";
import {
  formatCurrencyFromCents,
  formatDateBR,
  formatDateOnlyBR,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { CancelSubscriptionDialog } from "./cancel-subscription-dialog";
import { ChangePlanDialog } from "./change-plan-dialog";
import { StartSubscriptionDialog } from "./start-subscription-dialog";
import type {
  BillingPageData,
  BillingPlan,
  BillingSubscriptionView,
} from "../types";

const gatewayStatusLabels: Record<string, string> = {
  pending_creation: "Aguardando criação no Asaas",
  active: "Ativa no Asaas",
  inactive: "Inativa no Asaas",
  expired: "Expirada no Asaas",
};

function PlanCard({
  plan,
  subscription,
  canManage,
  asaasConfigured,
  changeBlocked,
  onSelect,
}: {
  plan: BillingPlan;
  subscription: BillingSubscriptionView;
  canManage: boolean;
  asaasConfigured: boolean;
  changeBlocked: boolean;
  onSelect: (plan: BillingPlan) => void;
}) {
  const isCurrent = subscription.planId === plan.id;
  const canCharge = plan.price_cents > 0;
  const highlighted = plan.code === "profissional";
  const disabled =
    !canManage || !canCharge || isCurrent || changeBlocked || !asaasConfigured;

  return (
    <Card
      className={cn(
        "relative flex flex-col",
        highlighted && "border-t-4 border-gold bg-gold-soft/15 ring-gold/50",
      )}
    >
      {highlighted ? (
        <span className="mx-4 w-fit">
          <Badge
            variant="outline"
            className="border-gold/35 bg-gold-soft/60 text-[9px] uppercase tracking-[0.12em]"
          >
            Mais recomendado
          </Badge>
        </span>
      ) : null}
      <CardHeader>
        <CardTitle className="font-display text-xl">{plan.name}</CardTitle>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {plan.description ?? "Plano da plataforma LPS Agenda."}
        </p>
        <p className="mt-3 font-display text-3xl tabular-nums">
          {formatCurrencyFromCents(plan.price_cents, plan.currency)}
          <span className="ml-1 font-sans text-xs font-normal text-muted-foreground">
            {plan.interval === "year" ? "/ ano" : "/ mês"}
          </span>
        </p>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        {plan.max_barbers ? (
          <p className="mt-4 border-t border-border/70 pt-3 text-[10px] text-muted-foreground">
            Até {plan.max_barbers}{" "}
            {plan.max_barbers === 1
              ? "profissional ativo"
              : "profissionais ativos"}{" "}
            por barbearia.
          </p>
        ) : null}

        <div className="mt-auto pt-4">
          <Button
            type="button"
            variant={highlighted ? "gold" : "outline"}
            className="w-full"
            disabled={disabled}
            onClick={() => onSelect(plan)}
          >
            {isCurrent ? (
              <>
                <BadgeCheck className="size-4" />
                Plano atual
              </>
            ) : !canCharge ? (
              "Sem valor de cobrança"
            ) : (
              <>
                <ArrowLeftRight className="size-4" />
                Trocar para este plano
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function BillingManager({
  data,
  timezone,
  canManage,
}: {
  data: BillingPageData & { subscription: BillingSubscriptionView };
  timezone: string;
  canManage: boolean;
}) {
  const { plans, subscription, customer, invoices, asaasConfigured } = data;
  const [startPlan, setStartPlan] = useState<BillingPlan | null>(null);
  const [changePlan, setChangePlan] = useState<BillingPlan | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);

  const actionBlocked = !canManage;
  const currentPlan = subscription?.plan ?? null;
  const hasPendingRemoteCreation =
    subscription?.status === "pending" && !subscription.hasRemoteSubscription;
  const isLocalTrial =
    subscription?.status === "trialing" && !subscription.hasRemoteSubscription;
  const changeBlocked = Boolean(subscription?.billingMutationInProgress);
  const remoteCleanupPending = Boolean(subscription?.remoteCleanupPending);

  const onSelectPlan = (plan: BillingPlan) => {
    if (actionBlocked || plan.price_cents <= 0 || changeBlocked) {
      return;
    }

    setChangePlan(plan);
  };

  return (
    <div className="space-y-7">
      {!asaasConfigured ? (
        <NoticeCard
          icon={LockKeyhole}
          title="Contratação automática indisponível"
          tone="warning"
        >
          As operações que dependem do Asaas estão temporariamente
          indisponíveis.
        </NoticeCard>
      ) : null}

      {!canManage ? (
        <NoticeCard
          icon={ShieldCheck}
          title="Somente o proprietário gerencia a assinatura"
        >
          A leitura está disponível, mas contratar, trocar de plano e cancelar
          são ações exclusivas do proprietário da barbearia.
        </NoticeCard>
      ) : null}

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 border-b border-border/70 pb-4">
          <div>
            <CardTitle className="flex flex-wrap items-center gap-2">
              Assinatura legada Asaas
              <SubscriptionStatusBadge status={subscription.status} />
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Mensalidade da plataforma, separada do financeiro dos serviços da
              barbearia.
            </p>
          </div>
          {subscription && canManage ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setCancelOpen(true)}
            >
              Cancelar assinatura
            </Button>
          ) : null}
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Plano
                </p>
                <p className="mt-1 font-display text-xl">
                  {currentPlan?.name ?? "Plano vinculado"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {subscription.contractedPriceCents !== null
                    ? formatCurrencyFromCents(
                        subscription.contractedPriceCents,
                        subscription.contractedCurrency ?? "BRL",
                      )
                    : "Valor não definido"}
                  {subscription.contractedPriceCents !== null &&
                    subscription.contractedInterval &&
                    (subscription.contractedInterval === "year" ? " / ano" : " / mês")}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {subscription.status === "trialing"
                    ? "Fim do teste"
                    : "Próximo vencimento"}
                </p>
                <p className="mt-1 flex items-center gap-1.5 text-sm">
                  <CalendarClock className="size-3.5 text-gold" />
                  {subscription.status === "trialing"
                    ? formatDateBR(subscription.trialEndsAt, timezone)
                    : formatDateOnlyBR(subscription.nextDueDate)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Forma:{" "}
                  {subscription.billingType
                    ? BILLING_TYPE_LABELS[subscription.billingType]
                    : "não informada"}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Período atual
                </p>
                <p className="mt-1 text-sm">
                  {subscription.currentPeriodStart
                    ? formatDateBR(subscription.currentPeriodStart, timezone)
                    : "Não iniciado"}
                  {" → "}
                  {subscription.currentPeriodEnd
                    ? formatDateBR(subscription.currentPeriodEnd, timezone)
                    : "Em aberto"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Renovação automática:{" "}
                  {subscription.cancelAtPeriodEnd ? "cancelada" : "prevista"}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Pagador
                </p>
                {customer ? (
                  <>
                    <p className="mt-1 truncate text-sm">
                      {customer.holderName}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                      {customer.documentMasked}
                    </p>
                  </>
                ) : (
                  <p className="mt-1 text-sm text-muted-foreground">
                    Não cadastrado
                  </p>
                )}
                <p className="mt-1 text-xs text-muted-foreground">
                  {gatewayStatusLabels[subscription.gatewayStatus] ??
                    subscription.gatewayStatus}
                </p>
              </div>
            </div>

            {subscription.status === "trialing" ? (
              <div className="rounded-xl border border-sky-500/25 bg-sky-500/5 p-3.5">
                <p className="flex items-center gap-2 text-xs font-medium">
                  <Sparkles className="size-3.5 text-sky-600 dark:text-sky-300" />
                  Teste gratuito em andamento
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  Válido até {formatDateBR(subscription.trialEndsAt, timezone)}.
                  Nenhuma assinatura ou cobrança foi criada no Asaas. Ao final
                  do período, a recorrência é criada automaticamente e a
                  primeira fatura fica disponível para pagamento.
                </p>
              </div>
            ) : null}

            {subscription.status === "pending" ? (
              <div className="flex flex-col gap-3 rounded-xl border border-amber-500/25 bg-amber-500/5 p-3.5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-medium">
                    Aguardando confirmação do primeiro pagamento
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                    {subscription.trialEndsAt
                      ? "O teste gratuito terminou. A primeira cobrança está sendo preparada no Asaas e o plano será ativado após a confirmação do pagamento por webhook."
                      : "A assinatura permanece pendente até o Asaas confirmar o pagamento por webhook. Nenhum evento de criação de assinatura ativa o plano."}
                  </p>
                </div>
                {canManage && asaasConfigured && currentPlan ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setStartPlan(currentPlan)}
                  >
                    {hasPendingRemoteCreation
                      ? "Retomar contratação"
                      : "Revisar contratação"}
                  </Button>
                ) : null}
              </div>
            ) : null}

            {changeBlocked || remoteCleanupPending ? (
              <NoticeCard
                icon={LockKeyhole}
                title={
                  changeBlocked
                    ? "Alteração de plano temporariamente bloqueada"
                    : "Confirmação de limpeza remota pendente"
                }
                tone="warning"
              >
                {changeBlocked
                  ? "Outra operação de cobrança está em andamento. Aguarde a conclusão antes de trocar de plano."
                  : "A fila de compensação será validada no servidor antes de qualquer troca. Uma limpeza realmente aberta bloqueia a alteração; um sinal desatualizado não impede a retomada."}
              </NoticeCard>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-display text-xl tracking-tight">
              Troca de plano da assinatura legada
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Valores de catálogo aplicáveis à troca deste contrato Asaas.
            </p>
          </div>
        </div>

        {plans.length > 0 ? (
          <div className="grid gap-4 lg:grid-cols-3">
            {plans.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                subscription={subscription}
                canManage={canManage}
                asaasConfigured={asaasConfigured}
                changeBlocked={changeBlocked}
                onSelect={onSelectPlan}
              />
            ))}
          </div>
        ) : (
          <DashboardEmpty
            icon={FileClock}
            title="Nenhum plano configurado"
            description="O catálogo de planos está vazio. A contratação fica bloqueada até a plataforma definir preço, ciclo, recursos e limites de um plano."
          />
        )}
      </div>

      <LegacyInvoices invoices={invoices} timezone={timezone} />
      <div className="grid gap-4 lg:grid-cols-2">
        <NoticeCard
          icon={ShieldCheck}
          title="Cobrança sob controle"
          tone="gold"
        >
          Acompanhe boletos e Pix no histórico. A situação do pagamento é
          atualizada após a confirmação pelo provedor.
        </NoticeCard>
        <NoticeCard icon={LockKeyhole} title="Dados de pagamento">
          Boleto e Pix usam os dados do titular informados na contratação. Você
          pode conferir o titular na seção de assinatura.
        </NoticeCard>
      </div>

      {startPlan ? (
        <StartSubscriptionDialog
          open={Boolean(startPlan)}
          onOpenChange={(open) => {
            if (!open) {
              setStartPlan(null);
            }
          }}
          plan={startPlan}
        />
      ) : null}

      {changePlan ? (
        <ChangePlanDialog
          open={Boolean(changePlan)}
          onOpenChange={(open) => {
            if (!open) {
              setChangePlan(null);
            }
          }}
          plan={changePlan}
          trialing={isLocalTrial}
        />
      ) : null}

      <CancelSubscriptionDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        trialing={isLocalTrial}
      />
    </div>
  );
}
