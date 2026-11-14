"use client";

import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  Clock3,
  Loader2,
  LockKeyhole,
  Scissors,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";

import { FormError } from "@/components/forms/form-message";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createPublicBookingAction, getPublicAvailabilityAction } from "@/features/public-booking/actions";
import type {
  PublicBarber,
  PublicService,
} from "@/features/public-booking/types";
import type { AvailabilitySnapshot } from "@/features/scheduling/types";
import { fieldErrorsFrom } from "@/lib/actions";
import {
  formatCurrencyFromCents,
  formatDateOnlyBR,
  initialsFromName,
} from "@/lib/format";
import { publicBookingSchema } from "@/lib/validation/public-booking";
import { cn } from "@/lib/utils";

type Step = 1 | 2 | 3 | 4;

const steps: Array<{ id: Step; label: string; short: string }> = [
  { id: 1, label: "Serviço", short: "1" },
  { id: 2, label: "Profissional", short: "2" },
  { id: 3, label: "Data e hora", short: "3" },
  { id: 4, label: "Seus dados", short: "4" },
];

function timeGroup(time: string): "morning" | "afternoon" | "evening" {
  const hour = Number(time.slice(0, 2));

  if (hour < 12) {
    return "morning";
  }

  if (hour < 18) {
    return "afternoon";
  }

  return "evening";
}

const groupLabels = {
  morning: "Manhã",
  afternoon: "Tarde",
  evening: "Noite",
} as const;

export function BookingWizard({
  slug,
  timezone,
  services,
  barbers,
  minDate,
  maxDate,
}: {
  slug: string;
  timezone: string;
  services: PublicService[];
  barbers: PublicBarber[];
  minDate: string;
  maxDate: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [barberId, setBarberId] = useState<string | null>(null);
  const [date, setDate] = useState(minDate);
  const [time, setTime] = useState<string | null>(null);
  const [availability, setAvailability] =
    useState<AvailabilitySnapshot | null>(null);
  const [availabilityError, setAvailabilityError] = useState<string | null>(
    null,
  );
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [reloadSlots, setReloadSlots] = useState(0);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<
    Record<string, string[] | undefined>
  >({});
  const [isPending, startTransition] = useTransition();

  const selectedService = services.find((service) => service.id === serviceId);
  const selectedBarber = barbers.find((barber) => barber.id === barberId);
  const eligibleBarbers = useMemo(
    () =>
      barbers.filter((barber) =>
        serviceId ? barber.serviceIds.includes(serviceId) : false,
      ),
    [barbers, serviceId],
  );

  useEffect(() => {
    if (step !== 3 || !serviceId || !barberId) {
      return;
    }

    let active = true;

    getPublicAvailabilityAction({ slug, serviceId, barberId, date }).then(
      (result) => {
        if (!active) {
          return;
        }

        setLoadingSlots(false);

        if (result.status === "success") {
          setAvailability(result.availability);
          return;
        }

        setAvailabilityError(result.message);
      },
    );

    return () => {
      active = false;
    };
  }, [step, slug, serviceId, barberId, date, reloadSlots]);

  const groupedSlots = useMemo(() => {
    const groups: Record<"morning" | "afternoon" | "evening", string[]> = {
      morning: [],
      afternoon: [],
      evening: [],
    };

    for (const slot of availability?.slots ?? []) {
      groups[timeGroup(slot.time)].push(slot.time);
    }

    return groups;
  }, [availability]);

  function resetMessages() {
    setFormError(null);
    setFieldErrors({});
  }

  function beginSlotLoading() {
    setLoadingSlots(true);
    setAvailability(null);
    setAvailabilityError(null);
  }

  function chooseService(id: string) {
    resetMessages();
    setServiceId(id);
    setBarberId(null);
    setTime(null);
    setAvailability(null);
    setStep(2);
  }

  function chooseBarber(id: string) {
    resetMessages();
    setBarberId(id);
    setTime(null);
    beginSlotLoading();
    setStep(3);
  }

  function chooseDate(value: string) {
    if (value === date) {
      return;
    }

    resetMessages();
    setDate(value);
    setTime(null);
    beginSlotLoading();
  }

  function goToStep(next: Step) {
    resetMessages();

    if (next === 3) {
      beginSlotLoading();
    }

    setStep(next);
  }

  function submit() {
    const values = {
      slug,
      serviceId: serviceId ?? "",
      barberId: barberId ?? "",
      date,
      time: time ?? "",
      fullName,
      phone,
      email,
    };
    const parsed = publicBookingSchema.safeParse(values);

    if (!parsed.success) {
      setFieldErrors(fieldErrorsFrom(parsed.error));
      setFormError("Revise os dados abaixo para concluir a reserva.");
      return;
    }

    setFormError(null);
    setFieldErrors({});

    startTransition(async () => {
      const result = await createPublicBookingAction(parsed.data);

      if (result.status === "success") {
        router.push(
          `/agendar/${result.slug}/reserva/${result.token}?novo=1`,
        );
        return;
      }

      setFormError(result.message);
      setFieldErrors(result.fieldErrors ?? {});

      if (result.fieldErrors?.time) {
        // O horário deixou de existir entre a seleção e a confirmação.
        // Voltamos para a etapa 3 e forçamos uma nova consulta de slots.
        setTime(null);
        beginSlotLoading();
        setReloadSlots((value) => value + 1);
        setStep(3);
      }
    });
  }

  const canSubmit = Boolean(
    serviceId && barberId && date && time && fullName && phone,
  );

  return (
    <div className="overflow-hidden rounded-[1.75rem] border border-border/80 bg-card shadow-premium">
      <div className="border-b border-border/70 bg-muted/25 px-5 py-5 sm:px-7">
        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-gold">
          <CalendarDays className="size-3.5" />
          Agendamento online
        </div>
        <h2 className="mt-2 font-display text-2xl tracking-tight sm:text-3xl">
          Escolha seu horário
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Sem login, sem cadastro. Você recebe um link para consultar ou
          cancelar a reserva.
        </p>

        <ol className="mt-5 grid grid-cols-4 gap-2">
          {steps.map((item) => {
            const active = step === item.id;
            const complete = step > item.id;

            return (
              <li key={item.id} className="min-w-0">
                <div
                  className={cn(
                    "flex items-center gap-1.5 sm:gap-2",
                    active || complete
                      ? "text-foreground"
                      : "text-muted-foreground/70",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-6 shrink-0 place-items-center rounded-full border text-[10px] font-semibold",
                      active &&
                        "border-gold bg-gold text-gold-foreground",
                      complete &&
                        "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
                      !active &&
                        !complete &&
                        "border-border bg-background text-muted-foreground",
                    )}
                  >
                    {complete ? <Check className="size-3" /> : item.short}
                  </span>
                  <span className="truncate text-[10px] font-medium sm:text-xs">
                    {item.label}
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="px-5 py-6 sm:px-7">
        <FormError message={formError} />

        {step === 1 ? (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Etapa 1
            </p>
            <h3 className="mt-1 font-display text-xl tracking-tight">
              Qual serviço você quer?
            </h3>

            {services.length === 0 ? (
              <p className="mt-5 rounded-xl border border-dashed border-border bg-muted/20 p-5 text-sm text-muted-foreground">
                Esta barbearia ainda não tem serviços disponíveis para
                agendamento online.
              </p>
            ) : (
              <div className="mt-4 grid gap-2.5">
                {services.map((service) => (
                  <button
                    key={service.id}
                    type="button"
                    onClick={() => chooseService(service.id)}
                    className={cn(
                      "group flex w-full items-center gap-3 rounded-xl border p-3.5 text-left transition-colors",
                      serviceId === service.id
                        ? "border-gold/50 bg-gold-soft/30"
                        : "border-border/80 bg-background hover:border-gold/35 hover:bg-muted/30",
                    )}
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-gold/25 bg-gold-soft/40 text-gold">
                      <Scissors className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">
                        {service.name}
                      </span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Clock3 className="size-3" />
                          {service.durationMinutes} min
                        </span>
                        <span className="text-border">·</span>
                        <span>{formatCurrencyFromCents(service.priceCents)}</span>
                      </span>
                    </span>
                    <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : null}

        {step === 2 ? (
          <div>
            <button
              type="button"
              onClick={() => goToStep(1)}
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="size-3" />
              Trocar serviço
            </button>
            <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Etapa 2
            </p>
            <h3 className="mt-1 font-display text-xl tracking-tight">
              Com quem você quer atendimento?
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Mostrando apenas profissionais habilitados para{" "}
              <span className="font-medium text-foreground">
                {selectedService?.name}
              </span>
              .
            </p>

            <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
              {eligibleBarbers.map((barber) => (
                <button
                  key={barber.id}
                  type="button"
                  onClick={() => chooseBarber(barber.id)}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border p-3.5 text-left transition-colors",
                    barberId === barber.id
                      ? "border-gold/50 bg-gold-soft/30"
                      : "border-border/80 bg-background hover:border-gold/35 hover:bg-muted/30",
                  )}
                >
                  <Avatar className="size-10">
                    {barber.avatarUrl ? (
                      <AvatarImage src={barber.avatarUrl} alt="" />
                    ) : null}
                    <AvatarFallback className="bg-primary font-display text-xs text-gold">
                      {initialsFromName(barber.name)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {barber.name}
                    </span>
                    {barber.bio ? (
                      <span className="mt-0.5 line-clamp-2 block text-[11px] leading-relaxed text-muted-foreground">
                        {barber.bio}
                      </span>
                    ) : (
                      <span className="mt-0.5 block text-[11px] text-muted-foreground">
                        Profissional
                      </span>
                    )}
                  </span>
                </button>
              ))}
            </div>

            {eligibleBarbers.length === 0 ? (
              <p className="mt-4 rounded-xl border border-dashed border-border bg-muted/20 p-4 text-xs text-muted-foreground">
                Nenhum profissional ativo realiza este serviço agora. Volte e
                escolha outro serviço.
              </p>
            ) : null}
          </div>
        ) : null}

        {step === 3 ? (
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => goToStep(2)}
                className="inline-flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
              >
                <ArrowLeft className="size-3" />
                Trocar profissional
              </button>
              <span className="text-[10px] text-muted-foreground">
                {selectedService?.name} · {selectedBarber?.name}
              </span>
            </div>

            <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Etapa 3
            </p>
            <h3 className="mt-1 font-display text-xl tracking-tight">
              Escolha a data e o horário
            </h3>

            <div className="mt-4 max-w-xs">
              <Label htmlFor="booking-date" className="text-xs">
                Data
              </Label>
              <Input
                id="booking-date"
                type="date"
                value={date}
                min={minDate}
                max={maxDate}
                onChange={(event) => chooseDate(event.target.value)}
                className="mt-1.5 h-10"
              />
              <p className="mt-1 text-[10px] text-muted-foreground">
                Reservas abertas por até 60 dias. Horários no fuso {timezone}.
              </p>
            </div>

            <div className="mt-5" aria-live="polite">
              {loadingSlots ? (
                <div className="flex items-center gap-2 rounded-xl border border-border/80 bg-muted/20 p-4 text-xs text-muted-foreground">
                  <Loader2 className="size-4 animate-spin text-gold" />
                  Consultando horários livres...
                </div>
              ) : null}

              {!loadingSlots && availabilityError ? (
                <div className="rounded-xl border border-destructive/25 bg-destructive/5 p-4 text-xs text-destructive">
                  {availabilityError}
                </div>
              ) : null}

              {!loadingSlots && !availabilityError && availability ? (
                availability.slots.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border bg-muted/20 p-4 text-xs text-muted-foreground">
                    {availability.reason ??
                      "Não há horários livres neste dia. Escolha outra data."}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {(["morning", "afternoon", "evening"] as const).map(
                      (group) =>
                        groupedSlots[group].length > 0 ? (
                          <div key={group}>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                              {groupLabels[group]}
                            </p>
                            <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
                              {groupedSlots[group].map((slot) => (
                                <button
                                  key={slot}
                                  type="button"
                                  onClick={() => {
                                    resetMessages();
                                    setTime(slot);
                                  }}
                                  className={cn(
                                    "rounded-lg border px-2 py-2 text-xs font-medium transition-colors",
                                    time === slot
                                      ? "border-gold bg-gold text-gold-foreground"
                                      : "border-border/80 bg-background hover:border-gold/40 hover:bg-gold-soft/25",
                                  )}
                                >
                                  {slot}
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : null,
                    )}
                  </div>
                )
              ) : null}
            </div>

            <Button
              type="button"
              variant="gold"
              size="lg"
              className="mt-6 w-full sm:w-auto"
              disabled={!time || loadingSlots}
              onClick={() => goToStep(4)}
            >
              Continuar
              <ArrowRight className="size-4" />
            </Button>
          </div>
        ) : null}

        {step === 4 ? (
          <div>
            <button
              type="button"
              onClick={() => goToStep(3)}
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="size-3" />
              Trocar horário
            </button>

            <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Etapa 4
            </p>
            <h3 className="mt-1 font-display text-xl tracking-tight">
              Só falta você se identificar
            </h3>

            <div className="mt-4 grid gap-4">
              <div className="rounded-xl border border-gold/25 bg-gold-soft/25 p-4">
                <div className="grid gap-2 text-xs sm:grid-cols-2">
                  <p>
                    <span className="text-muted-foreground">Serviço:</span>{" "}
                    <span className="font-medium">{selectedService?.name}</span>
                  </p>
                  <p>
                    <span className="text-muted-foreground">Profissional:</span>{" "}
                    <span className="font-medium">{selectedBarber?.name}</span>
                  </p>
                  <p>
                    <span className="text-muted-foreground">Data:</span>{" "}
                    <span className="font-medium">{formatDateOnlyBR(date)}</span>
                  </p>
                  <p>
                    <span className="text-muted-foreground">Horário:</span>{" "}
                    <span className="font-medium">{time}</span>
                  </p>
                  <p>
                    <span className="text-muted-foreground">Duração:</span>{" "}
                    <span className="font-medium">
                      {availability?.durationMinutes ??
                        selectedService?.durationMinutes}{" "}
                      min
                    </span>
                  </p>
                  <p>
                    <span className="text-muted-foreground">Valor:</span>{" "}
                    <span className="font-medium">
                      {formatCurrencyFromCents(
                        availability?.priceCents ??
                          selectedService?.priceCents ??
                          0,
                      )}
                    </span>
                  </p>
                </div>
              </div>

              <div>
                <Label htmlFor="booking-name" className="text-xs">
                  Nome completo
                </Label>
                <Input
                  id="booking-name"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  placeholder="Como devemos chamar você?"
                  autoComplete="name"
                  className="mt-1.5 h-10"
                  aria-invalid={Boolean(fieldErrors.fullName)}
                />
                {fieldErrors.fullName?.[0] ? (
                  <p className="mt-1 text-[11px] text-destructive">
                    {fieldErrors.fullName[0]}
                  </p>
                ) : null}
              </div>

              <div>
                <Label htmlFor="booking-phone" className="text-xs">
                  Telefone com DDD
                </Label>
                <Input
                  id="booking-phone"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="(11) 98765-4321"
                  autoComplete="tel"
                  inputMode="tel"
                  className="mt-1.5 h-10"
                  aria-invalid={Boolean(fieldErrors.phone)}
                />
                {fieldErrors.phone?.[0] ? (
                  <p className="mt-1 text-[11px] text-destructive">
                    {fieldErrors.phone[0]}
                  </p>
                ) : null}
              </div>

              <div>
                <Label htmlFor="booking-email" className="text-xs">
                  E-mail{" "}
                  <span className="font-normal text-muted-foreground">
                    (opcional)
                  </span>
                </Label>
                <Input
                  id="booking-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="voce@exemplo.com"
                  autoComplete="email"
                  className="mt-1.5 h-10"
                  aria-invalid={Boolean(fieldErrors.email)}
                />
                {fieldErrors.email?.[0] ? (
                  <p className="mt-1 text-[11px] text-destructive">
                    {fieldErrors.email[0]}
                  </p>
                ) : null}
              </div>

              {fieldErrors.time?.[0] ? (
                <p className="rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2 text-[11px] text-destructive">
                  {fieldErrors.time[0]}
                </p>
              ) : null}

              <div className="flex items-start gap-2 rounded-xl border border-border/70 bg-muted/20 p-3 text-[11px] leading-relaxed text-muted-foreground">
                <LockKeyhole className="mt-0.5 size-3.5 shrink-0 text-gold" />
                <p>
                  Pedimos apenas nome, telefone e e-mail opcional. Seus dados
                  são usados para esta reserva e ficam visíveis somente para a
                  barbearia.
                </p>
              </div>

              <Button
                type="button"
                variant="gold"
                size="xl"
                disabled={!canSubmit || isPending}
                onClick={submit}
              >
                {isPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Confirmando reserva...
                  </>
                ) : (
                  <>
                    <ShieldCheck className="size-4" />
                    Confirmar reserva
                  </>
                )}
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/70 bg-muted/20 px-5 py-3 text-[10px] text-muted-foreground sm:px-7">
        <span className="inline-flex items-center gap-1.5">
          <UserRound className="size-3 text-gold" />
          Sem conta e sem CPF
        </span>
        <span className="inline-flex items-center gap-1.5">
          <ShieldCheck className="size-3 text-gold" />
          Disponibilidade conferida no servidor
        </span>
      </div>
    </div>
  );
}
