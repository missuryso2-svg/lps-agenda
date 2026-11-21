"use client";

import {
  Banknote,
  CalendarPlus,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Loader2,
  Search,
  Scissors,
  UserRound,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { FormError } from "@/components/forms/form-message";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  createAppointmentAction,
  searchAppointmentCustomersAction,
} from "@/features/scheduling/actions";
import { SlotPicker } from "@/features/scheduling/components/slot-picker";
import type {
  CustomerOption,
  CustomerSearchResult,
  SchedulingOptions,
} from "@/features/scheduling/types";
import {
  formatCurrencyFromCents,
  formatDateOnlyBR,
  formatPhoneBR,
  initialsFromName,
} from "@/lib/format";
import { cn } from "@/lib/utils";

const NOTES_MAX = 2000;

const steps = [
  { title: "Cliente", description: "Quem será atendido" },
  { title: "Serviço", description: "O que e com quem" },
  { title: "Horário", description: "Quando acontece" },
  { title: "Confirmar", description: "Revise e salve" },
] as const;

export function NewAppointmentDialog({
  open,
  onOpenChange,
  options,
  initialCustomers,
  defaultDate,
  today,
  timeZone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  options: SchedulingOptions;
  initialCustomers: CustomerOption[];
  defaultDate: string;
  today: string;
  timeZone: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [search, setSearch] = useState("");
  const [customerSearch, setCustomerSearch] = useState<{
    term: string;
    result: CustomerSearchResult;
  } | null>(null);
  const [quickName, setQuickName] = useState("");
  const [existingCustomer, setSelectedCustomer] =
    useState<CustomerOption | null>(null);
  const selectedCustomer =
    existingCustomer ??
    (quickName.trim().length >= 2
      ? { id: null, fullName: quickName.trim() }
      : null);
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [barberId, setBarberId] = useState<string | null>(null);
  const [date, setDate] = useState(
    defaultDate >= today ? defaultDate : today,
  );
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const searchTerm = search.trim();

  useEffect(() => {
    if (!open || step !== 0 || searchTerm.length === 0) {
      return;
    }

    let active = true;

    const timer = window.setTimeout(() => {
      searchAppointmentCustomersAction(searchTerm)
        .then((result) => {
          if (active) {
            setCustomerSearch({ term: searchTerm, result });
          }
        })
        .catch(() => {
          if (active) {
            setCustomerSearch({
              term: searchTerm,
              result: {
                status: "error",
                message:
                  "Não foi possível pesquisar clientes agora. Tente novamente.",
              },
            });
          }
        });
    }, 300);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [open, searchTerm, step]);

  const currentSearch =
    searchTerm.length > 0 && customerSearch?.term === searchTerm
      ? customerSearch.result
      : null;
  const searching = searchTerm.length > 0 && currentSearch === null;
  const searchError =
    currentSearch?.status === "error" ? currentSearch.message : null;
  const customerResults =
    searchTerm.length === 0
      ? initialCustomers
      : currentSearch?.status === "success"
        ? currentSearch.customers
        : [];

  const selectedService = useMemo(
    () => options.services.find((service) => service.id === serviceId) ?? null,
    [options.services, serviceId],
  );

  const eligibleBarbers = useMemo(() => {
    if (!serviceId) {
      return [];
    }

    const eligibleIds = new Set(
      options.assignments
        .filter((assignment) => assignment.serviceId === serviceId)
        .map((assignment) => assignment.barberId),
    );

    return options.barbers.filter((barber) => eligibleIds.has(barber.id));
  }, [options.assignments, options.barbers, serviceId]);

  const selectedBarber =
    eligibleBarbers.find((barber) => barber.id === barberId) ?? null;

  const clearError = () => {
    setServerError(null);
  };

  const closeDialog = (nextOpen: boolean) => {
    if (!isPending) {
      onOpenChange(nextOpen);
    }
  };

  const selectService = (nextServiceId: string) => {
    setServiceId(nextServiceId);
    setBarberId(null);
    setSelectedTime(null);
    clearError();
  };

  const selectBarber = (nextBarberId: string) => {
    setBarberId(nextBarberId);
    setSelectedTime(null);
    clearError();
  };

  const goBack = () => {
    clearError();
    setStep((current) => Math.max(0, current - 1));
  };

  const goForward = () => {
    if (step === 0 && !selectedCustomer) {
      toast.error("Selecione um cliente para continuar.");
      return;
    }

    if (step === 1 && (!selectedService || !selectedBarber)) {
      toast.error("Selecione o serviço e o profissional para continuar.");
      return;
    }

    if (step === 2 && (!date || !selectedTime)) {
      toast.error("Selecione uma data e um horário para continuar.");
      return;
    }

    clearError();
    setStep((current) => Math.min(steps.length - 1, current + 1));
  };

  const submit = () => {
    if (!selectedCustomer || !selectedService || !selectedBarber || !selectedTime) {
      setServerError(
        "Revise as etapas do agendamento antes de confirmar.",
      );
      return;
    }

    setServerError(null);

    startTransition(async () => {
      const result = await createAppointmentAction({
        ...(selectedCustomer.id
          ? { customerId: selectedCustomer.id }
          : { newCustomerName: selectedCustomer.fullName }),
        serviceId: selectedService.id,
        barberId: selectedBarber.id,
        date,
        time: selectedTime,
        notes,
      });

      if (result.status === "error") {
        setServerError(
          result.message ?? "Não foi possível criar o agendamento.",
        );
        toast.error(
          result.message ?? "Não foi possível criar o agendamento.",
        );
        return;
      }

      toast.success(result.message ?? "Agendamento criado.");
      onOpenChange(false);
      router.refresh();
    });
  };

  return (
    <Dialog open={open} onOpenChange={closeDialog}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Agendar cliente presencial</DialogTitle>
          <DialogDescription>
            Cliente, serviço e profissional são validados na barbearia ativa. A
            disponibilidade é calculada no servidor e confirmada novamente ao
            salvar.
          </DialogDescription>
        </DialogHeader>

        <ol
          className="grid grid-cols-4 gap-2"
          aria-label="Etapas do agendamento"
        >
          {steps.map((item, index) => {
            const complete = index < step;
            const active = index === step;

            return (
              <li key={item.title} className="min-w-0">
                <div
                  className={cn(
                    "flex items-center gap-2 rounded-xl border px-2.5 py-2",
                    active
                      ? "border-gold/40 bg-gold-soft/45"
                      : "border-border/70 bg-muted/15",
                  )}
                  aria-current={active ? "step" : undefined}
                >
                  <span
                    className={cn(
                      "grid size-6 shrink-0 place-items-center rounded-full border text-[10px] font-semibold",
                      complete
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                        : active
                          ? "border-gold bg-gold text-gold-foreground"
                          : "border-border bg-muted text-muted-foreground",
                    )}
                  >
                    {complete ? <Check className="size-3" /> : index + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[11px] font-medium">
                      {item.title}
                    </span>
                    <span className="hidden truncate text-[9px] text-muted-foreground sm:block">
                      {item.description}
                    </span>
                  </span>
                </div>
              </li>
            );
          })}
        </ol>

        <FormError message={serverError} />

        {step === 0 ? (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="quick-name">Novo cliente presencial</Label>
              <Input
                id="quick-name"
                placeholder="Nome do novo cliente"
                maxLength={120}
                value={quickName}
                onChange={(e) => {
                  setQuickName(e.target.value);
                  setSelectedCustomer(null);
                  clearError();
                }}
              />
              <Label htmlFor="appointment-customer-search">
                Ou selecionar cliente cadastrado
              </Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="appointment-customer-search"
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Nome, telefone ou e-mail..."
                  autoComplete="off"
                  className="h-10 rounded-xl pl-9"
                  disabled={isPending}
                />
                {searching ? (
                  <Loader2 className="absolute right-3 top-1/2 size-3.5 -translate-y-1/2 animate-spin text-gold" />
                ) : null}
              </div>
            </div>

            {searchError ? <FormError message={searchError} /> : null}

            <div
              className="max-h-64 space-y-2 overflow-y-auto pr-1"
              role="listbox"
              aria-label="Clientes encontrados"
            >
              {customerResults.length === 0 && !searching ? (
                <div className="rounded-xl border border-dashed border-border/80 bg-muted/20 px-4 py-6 text-center">
                  <p className="text-xs font-medium">
                    Nenhum cliente ativo encontrado
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Preencha o nome acima para cadastrá-lo ao confirmar a
                    reserva.
                  </p>
                </div>
              ) : (
                customerResults.map((customer) => {
                  const selected = selectedCustomer?.id === customer.id;

                  return (
                    <button
                      key={customer.id}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onClick={() => {
                        setQuickName("");
                        setSelectedCustomer(customer);
                        clearError();
                      }}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                        selected
                          ? "border-gold/45 bg-gold-soft/45"
                          : "border-border/80 bg-card hover:bg-muted/40",
                      )}
                    >
                      <span className="grid size-9 shrink-0 place-items-center rounded-full border border-gold/25 bg-gold-soft/40 text-[10px] font-semibold text-gold">
                        {initialsFromName(customer.fullName)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {customer.fullName}
                        </span>
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {formatPhoneBR(customer.phone)}
                          {customer.email ? ` · ${customer.email}` : ""}
                        </span>
                      </span>
                      {selected ? (
                        <Check className="size-4 shrink-0 text-gold" />
                      ) : null}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Serviço</Label>
              {options.services.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border/80 bg-muted/20 px-4 py-6 text-center text-xs text-muted-foreground">
                  Nenhum serviço ativo. Cadastre um serviço antes de agendar.
                </div>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {options.services.map((service) => {
                    const selected = service.id === serviceId;

                    return (
                      <button
                        key={service.id}
                        type="button"
                        onClick={() => selectService(service.id)}
                        aria-pressed={selected}
                        className={cn(
                          "rounded-xl border p-3 text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                          selected
                            ? "border-gold/45 bg-gold-soft/45"
                            : "border-border/80 bg-card hover:bg-muted/40",
                        )}
                      >
                        <span className="flex items-center gap-2 text-sm font-medium">
                          <Scissors className="size-3.5 text-gold" />
                          {service.name}
                        </span>
                        <span className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <Clock3 className="size-3" />
                            {service.durationMinutes} min
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Banknote className="size-3" />
                            {formatCurrencyFromCents(service.priceCents)}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Profissional habilitado</Label>
              {!serviceId ? (
                <p className="text-[11px] text-muted-foreground">
                  Escolha um serviço para ver os profissionais habilitados.
                </p>
              ) : eligibleBarbers.length === 0 ? (
                <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-3.5 text-[11px] text-muted-foreground">
                  Nenhum profissional ativo realiza este serviço. Ajuste os
                  vínculos em Equipe.
                </div>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {eligibleBarbers.map((barber) => {
                    const selected = barber.id === barberId;

                    return (
                      <button
                        key={barber.id}
                        type="button"
                        onClick={() => selectBarber(barber.id)}
                        aria-pressed={selected}
                        className={cn(
                          "flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                          selected
                            ? "border-gold/45 bg-gold-soft/45"
                            : "border-border/80 bg-card hover:bg-muted/40",
                        )}
                      >
                        <UserRound className="size-3.5 text-gold" />
                        <span className="min-w-0 flex-1 truncate">
                          {barber.name}
                        </span>
                        {selected ? (
                          <Check className="size-3.5 text-gold" />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="appointment-date">Data</Label>
              <Input
                id="appointment-date"
                type="date"
                min={today}
                value={date}
                onChange={(event) => {
                  setDate(event.target.value);
                  setSelectedTime(null);
                  clearError();
                }}
                className="h-10 w-full rounded-xl sm:max-w-56"
                disabled={isPending}
              />
            </div>

            {selectedService && selectedBarber ? (
              <SlotPicker
                serviceId={selectedService.id}
                barberId={selectedBarber.id}
                date={date}
                timeZone={timeZone}
                selectedTime={selectedTime}
                onSelect={(time) => {
                  setSelectedTime(time);
                  clearError();
                }}
                disabled={isPending}
              />
            ) : null}
          </div>
        ) : null}

        {step === 3 && selectedCustomer && selectedService && selectedBarber ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-gold/25 bg-gold-soft/25 p-4">
              <div className="flex items-center justify-between gap-3">
                <Badge variant="outline" className="border-gold/30">
                  {formatDateOnlyBR(date)} · {selectedTime}
                </Badge>
                <span className="text-xs font-semibold tabular-nums">
                  {formatCurrencyFromCents(selectedService.priceCents)}
                </span>
              </div>
              <div className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Cliente
                  </p>
                  <p className="mt-0.5 font-medium">
                    {selectedCustomer.fullName}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Serviço
                  </p>
                  <p className="mt-0.5 font-medium">{selectedService.name}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Profissional
                  </p>
                  <p className="mt-0.5 font-medium">{selectedBarber.name}</p>
                </div>
              </div>
              <p className="mt-3 inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                <Clock3 className="size-3 text-gold" />
                Duração prevista: {selectedService.durationMinutes} minutos
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="appointment-notes">
                  Observações (opcional)
                </Label>
                <span className="text-[10px] text-muted-foreground">
                  {notes.length}/{NOTES_MAX}
                </span>
              </div>
              <Textarea
                id="appointment-notes"
                rows={3}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                maxLength={NOTES_MAX}
                placeholder="Preferências do cliente, detalhes do atendimento..."
                className="rounded-xl"
                disabled={isPending}
              />
            </div>
          </div>
        ) : null}

        <DialogFooter>
          {step > 0 ? (
            <Button
              type="button"
              variant="outline"
              onClick={goBack}
              disabled={isPending}
            >
              <ChevronLeft className="size-4" />
              Voltar
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancelar
            </Button>
          )}

          {step < steps.length - 1 ? (
            <Button
              type="button"
              variant="gold"
              onClick={goForward}
              disabled={
                isPending ||
                (step === 0 && !selectedCustomer) ||
                (step === 1 && (!selectedService || !selectedBarber)) ||
                (step === 2 && (!date || !selectedTime))
              }
            >
              Continuar
              <ChevronRight className="size-4" />
            </Button>
          ) : (
            <Button
              type="button"
              variant="gold"
              onClick={submit}
              disabled={isPending}
            >
              {isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <CalendarPlus className="size-4" />
                  Confirmar agendamento
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
