"use client";

import {
  ArrowLeftRight,
  BadgeCheck,
  CalendarClock,
  Check,
  CreditCard,
  FileClock,
  LockKeyhole,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  Wallet,
} from "lucide-react";
import { useState } from "react";

import { DashboardEmpty } from "@/components/dashboard/dashboard-empty";
import { NoticeCard } from "@/components/dashboard/notice-card";
import { PaymentStatusBadge, SubscriptionStatusBadge } from "@/components/dashboard/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BILLING_TYPE_LABELS, type BillingType } from "@/lib/validation/billing";
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

function planFeatures(plan: BillingPlan): string[] {
  return Array.isArray(plan.features)
    ? plan.features.filter((feature): feature is string => typeof feature === "string")
    : [];
}

function PlanCard({
  plan,
  subscription,
  canManage,
  asaasConfigured,
  trialAvailable,
  changeBlocked,
  onSelect,
}: {
  plan: BillingPlan;
  subscription: BillingSubscriptionView | null;
  canManage: boolean;
  asaasConfigured: boolean;
  trialAvailable: boolean;
  changeBlocked: boolean;
  onSelect: (plan: BillingPlan) => void;
}) {
  const isCurrent = subscription?.planId === plan.id;
  const canCharge = plan.price_cents > 0;
  const highlighted = plan.code === "profissional";
  const willStartTrial = trialAvailable && plan.trial_days > 0;
  const disabled =
    !canManage ||
    !canCharge ||
    isCurrent ||
    (Boolean(subscription) && changeBlocked) ||
    (!willStartTrial && !asaasConfigured);
  const features = planFeatures(plan);

  return (
    <Card
      className={cn(
        "relative flex flex-col",
        highlighted && "border-gold/35 bg-gold-soft/15 shadow-premium",
      )}
    >
      {highlighted ? (
        <span className="absolute right-3 top-3">
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
        <p className="mt-2 font-display text-2xl">
          {formatCurrencyFromCents(plan.price_cents, plan.currency)}
          <span className="ml-1 font-sans text-xs font-normal text-muted-foreground">
            {plan.interval === "year" ? "/ ano" : "/ mês"}
          </span>
        </p>
        {plan.trial_days > 0 ? (
          <p className="mt-2 inline-flex w-fit items-center gap-1.5 rounded-full border border-gold/30 bg-gold-soft/40 px-2.5 py-1 text-[10px] font-medium">
            <Sparkles className="size-3 text-gold" />
            {plan.trial_days} dias grátis
          </p>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
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
        {plan.max_barbers ? (
          <p className="mt-4 border-t border-border/70 pt-3 text-[10px] text-muted-foreground">
            Até {plan.max_barbers}{" "}
            {plan.max_barbers === 1 ? "profissional ativo" : "profissionais ativos"}{" "}
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
            ) : willStartTrial ? (
              <>
                <Sparkles className="size-4" />
                Iniciar teste grátis
              </>
            ) : subscription ? (
              <>
                <ArrowLeftRight className="size-4" />
                Trocar para este plano
              </>
            ) : (
              <>
                <CreditCard className="size-4" />
                Contratar plano
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
  data: BillingPageData;
  timezone: string;
  canManage: boolean;
}) {
  const {
    plans,
    subscription,
    customer,
    invoices,
    asaasConfigured,
    trialAvailable,
    hasUsedTrial,
    lastCanceled,
  } = data;
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
    if (
      actionBlocked ||
      plan.price_cents <= 0 ||
      (subscription !== null && changeBlocked)
    ) {
      return;
    }

    if (subscription) {
      setChangePlan(plan);
    } else if (trialAvailable || asaasConfigured) {
      setStartPlan(plan);
    }
  };

  return (
    <div className="space-y-7">
      {!asaasConfigured ? (
        <NoticeCard icon={LockKeyhole} title="Asaas Sandbox não configurado" tone="warning">
          {trialAvailable
            ? "O teste gratuito pode ser iniciado agora. A cobrança automática só será habilitada quando as credenciais Sandbox estiverem configuradas no servidor."
            : "Defina as credenciais do Asaas Sandbox no servidor para habilitar contratação, troca e cancelamento. Nenhuma cobrança é feita nesta tela enquanto a configuração estiver ausente."}
        </NoticeCard>
      ) : null}

      {trialAvailable ? (
        <NoticeCard
          icon={Sparkles}
          title="7 dias grátis para começar"
          tone="gold"
        >
          Nenhuma assinatura ou cobrança é criada no Asaas durante o teste. Ao
          final do período, a recorrência é criada automaticamente e a primeira
          fatura fica disponível para pagamento.
        </NoticeCard>
      ) : null}

      {hasUsedTrial && !subscription ? (
        <NoticeCard
          icon={CalendarClock}
          title="Teste gratuito já utilizado"
          tone="warning"
        >
          Esta barbearia já usou o período gratuito. Uma nova contratação cria a
          assinatura no Asaas e gera cobrança imediatamente.
        </NoticeCard>
      ) : null}

      {lastCanceled && !subscription ? (
        <NoticeCard
          icon={CalendarClock}
          title="Assinatura cancelada"
          tone="warning"
        >
          Cancelada em {formatDateBR(lastCanceled.canceledAt, timezone)}.{" "}
          {lastCanceled.cancelReason
            ? `Motivo: ${lastCanceled.cancelReason}`
            : "Nenhum motivo foi informado."}
        </NoticeCard>
      ) : null}

      {!canManage ? (
        <NoticeCard icon={ShieldCheck} title="Somente o proprietário gerencia a assinatura">
          A leitura está disponível, mas contratar, trocar de plano e cancelar
          são ações exclusivas do proprietário da barbearia.
        </NoticeCard>
      ) : null}

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 border-b border-border/70 pb-4">
          <div>
            <CardTitle className="flex flex-wrap items-center gap-2">
              Assinatura do LPS Agenda
              {subscription ? (
                <SubscriptionStatusBadge status={subscription.status} />
              ) : (
                <Badge
                  variant="outline"
                  className="border-border bg-muted/50 text-muted-foreground"
                >
                  Sem assinatura
                </Badge>
              )}
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
          {subscription ? (
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
                    {currentPlan
                      ? formatCurrencyFromCents(
                          subscription.contractedPriceCents ??
                            currentPlan.price_cents,
                          currentPlan.currency,
                        )
                      : "Valor não definido"}
                    {currentPlan?.interval === "year" ? " / ano" : " / mês"}
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
                      <p className="mt-1 truncate text-sm">{customer.holderName}</p>
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
                    Válido até{" "}
                    {formatDateBR(subscription.trialEndsAt, timezone)}. Nenhuma
                    assinatura ou cobrança foi criada no Asaas. Ao final do
                    período, a recorrência é criada automaticamente e a primeira
                    fatura fica disponível para pagamento.
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
          ) : (
            <DashboardEmpty
              className="border-0 bg-transparent py-6"
              icon={CreditCard}
              title="Nenhuma assinatura vinculada"
              description="Escolha um plano abaixo para iniciar a cobrança recorrente da mensalidade do LPS Agenda. A ativação ocorre somente após a confirmação do pagamento."
            />
          )}
        </CardContent>
      </Card>

      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-display text-xl tracking-tight">
              Planos disponíveis
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Preço, ciclo, recursos e limites vêm do catálogo de planos da
              plataforma.
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
                trialAvailable={trialAvailable}
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

      <Card>
        <CardHeader className="border-b border-border/70 pb-4">
          <CardTitle className="flex items-center gap-2">
            <ReceiptText className="size-4 text-gold" />
            Histórico da mensalidade
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Cobranças da assinatura do LPS Agenda. Os pagamentos dos serviços da
            barbearia continuam no Financeiro.
          </p>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {invoices.length > 0 ? (
            <div className="px-4 pb-2">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Referência</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Forma</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Cobrança</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((invoice) => (
                    <TableRow key={invoice.id}>
                      <TableCell>
                        <p className="font-mono text-[10px] text-muted-foreground">
                          {invoice.id.slice(0, 8)}
                        </p>
                        <p className="mt-0.5 text-[10px] text-muted-foreground">
                          criado em {formatDateBR(invoice.createdAt, timezone)}
                        </p>
                      </TableCell>
                      <TableCell className="text-xs font-medium tabular-nums">
                        {formatCurrencyFromCents(invoice.amountCents)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {invoice.method
                          ? BILLING_TYPE_LABELS[invoice.method as BillingType] ??
                            invoice.method
                          : "Não informada"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDateOnlyBR(invoice.dueDate)}
                      </TableCell>
                      <TableCell>
                        <PaymentStatusBadge status={invoice.status} />
                      </TableCell>
                      <TableCell className="text-right">
                        {invoice.invoiceUrl ? (
                          <Button asChild variant="ghost" size="sm">
                            <a
                              href={invoice.invoiceUrl}
                              target="_blank"
                              rel="noreferrer noopener"
                            >
                              Abrir
                            </a>
                          </Button>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">
                            —
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="px-4 pb-4">
              <DashboardEmpty
                icon={Wallet}
                title="Nenhuma cobrança registrada"
                description="As cobranças da mensalidade aparecem aqui depois que o Asaas criar a primeira fatura e enviar os eventos para o webhook."
              />
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <NoticeCard icon={ShieldCheck} title="Cobrança sob controle" tone="gold">
          Somente boleto e Pix estão disponíveis nesta fase. A confirmação vem de
          eventos financeiros do Asaas, nunca do evento de criação da assinatura.
        </NoticeCard>
        <NoticeCard icon={LockKeyhole} title="Segredos fora do cliente">
          As chaves de API, o token do webhook e a chave administrativa do
          Supabase permanecem restritas ao servidor. Nenhum dado de cartão é
          coletado ou armazenado.
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
          trialDays={trialAvailable ? startPlan.trial_days : 0}
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
