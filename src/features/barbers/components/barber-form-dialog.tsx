"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Save } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { FormError } from "@/components/forms/form-message";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  createBarberAction,
  updateBarberAction,
} from "@/features/barbers/actions";
import type {
  CatalogService,
  ManagedBarber,
} from "@/features/barbers/types";
import { applyServerFieldErrors } from "@/lib/form-errors";
import { formatCurrencyFromCents } from "@/lib/format";
import {
  barberFormSchema,
  type BarberFormValues,
} from "@/lib/validation/barbers";

function barberDefaults(barber: ManagedBarber | null): BarberFormValues {
  return {
    name: barber?.name ?? "",
    phone: barber?.phone ?? "",
    bio: barber?.bio ?? "",
    isActive: barber?.is_active ?? true,
    serviceIds: barber?.serviceIds ?? [],
  };
}

export function BarberFormDialog({
  open,
  onOpenChange,
  barber,
  services,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  barber: ManagedBarber | null;
  services: CatalogService[];
}) {
  const form = useForm<BarberFormValues>({
    resolver: zodResolver(barberFormSchema),
    defaultValues: barberDefaults(barber),
  });
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const bio = useWatch({ control: form.control, name: "bio" }) ?? "";
  const isActive = useWatch({ control: form.control, name: "isActive" });
  const selectedServiceIds =
    useWatch({ control: form.control, name: "serviceIds" }) ?? [];

  const toggleService = (serviceId: string, checked: boolean) => {
    const current = form.getValues("serviceIds") ?? [];
    const next = checked
      ? [...current, serviceId]
      : current.filter((id) => id !== serviceId);

    form.setValue("serviceIds", [...new Set(next)], {
      shouldDirty: true,
      shouldValidate: true,
    });
  };

  const selectAllServices = () => {
    form.setValue(
      "serviceIds",
      services.map((service) => service.id),
      { shouldDirty: true, shouldValidate: true },
    );
  };

  const clearServices = () => {
    form.setValue("serviceIds", [], {
      shouldDirty: true,
      shouldValidate: true,
    });
  };

  const onSubmit = (values: BarberFormValues) => {
    setServerError(null);

    startTransition(async () => {
      const result = barber
        ? await updateBarberAction(barber.id, values)
        : await createBarberAction(values);

      if (result.status === "error") {
        applyServerFieldErrors(form, result.fieldErrors);
        setServerError(result.message ?? "Não foi possível salvar o profissional.");
        toast.error(result.message ?? "Não foi possível salvar o profissional.");
        return;
      }

      toast.success(result.message ?? "Profissional salvo com sucesso.");
      onOpenChange(false);
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {barber ? "Editar profissional" : "Novo profissional"}
          </DialogTitle>
          <DialogDescription>
            {barber
              ? "Atualize os dados de atendimento e os serviços que este profissional realiza."
              : "Cadastre quem atende na barbearia e vincule os serviços disponíveis."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4">
          <FormError message={serverError} />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="barber-name">Nome</Label>
              <Input
                id="barber-name"
                placeholder="Nome do profissional"
                className="h-11 rounded-xl px-3"
                aria-invalid={Boolean(form.formState.errors.name)}
                disabled={isPending}
                {...form.register("name")}
              />
              {form.formState.errors.name ? (
                <p className="text-xs text-destructive">
                  {form.formState.errors.name.message}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="barber-phone">
                Telefone{" "}
                <span className="font-normal text-muted-foreground">
                  (opcional)
                </span>
              </Label>
              <Input
                id="barber-phone"
                type="tel"
                autoComplete="tel"
                placeholder="(11) 99999-9999"
                className="h-11 rounded-xl px-3"
                aria-invalid={Boolean(form.formState.errors.phone)}
                disabled={isPending}
                {...form.register("phone")}
              />
              {form.formState.errors.phone ? (
                <p className="text-xs text-destructive">
                  {form.formState.errors.phone.message}
                </p>
              ) : null}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="barber-bio">
                Descrição ou especialidade{" "}
                <span className="font-normal text-muted-foreground">
                  (opcional)
                </span>
              </Label>
              <span className="text-[10px] text-muted-foreground">
                {bio.length}/800
              </span>
            </div>
            <Textarea
              id="barber-bio"
              rows={3}
              placeholder="Especialidades, tempo de experiência ou apresentação."
              className="rounded-xl"
              aria-invalid={Boolean(form.formState.errors.bio)}
              disabled={isPending}
              {...form.register("bio")}
            />
            {form.formState.errors.bio ? (
              <p className="text-xs text-destructive">
                {form.formState.errors.bio.message}
              </p>
            ) : null}
          </div>

          <div className="flex items-center justify-between gap-4 rounded-xl border border-border/80 bg-muted/25 p-3.5">
            <div>
              <Label htmlFor="barber-active">Profissional ativo</Label>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                Profissionais inativos permanecem no histórico, mas saem da
                operação.
              </p>
            </div>
            <Switch
              id="barber-active"
              checked={Boolean(isActive)}
              onCheckedChange={(checked) =>
                form.setValue("isActive", checked, {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
              disabled={isPending}
              aria-label="Profissional ativo"
            />
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <Label>Serviços que realiza</Label>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {selectedServiceIds.length} serviço(s) selecionado(s)
                </p>
              </div>
              {services.length > 0 ? (
                <div className="flex items-center gap-1.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={selectAllServices}
                    disabled={isPending}
                  >
                    Selecionar todos
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={clearServices}
                    disabled={isPending || selectedServiceIds.length === 0}
                  >
                    Limpar
                  </Button>
                </div>
              ) : null}
            </div>

            {services.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/80 bg-muted/20 p-4 text-center">
                <p className="text-xs font-medium">
                  Nenhum serviço cadastrado ainda.
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Cadastre serviços antes de vincular o profissional.
                </p>
                <Button asChild variant="outline" size="sm" className="mt-3">
                  <Link href="/dashboard/servicos">Ir para Serviços</Link>
                </Button>
              </div>
            ) : (
              <div className="max-h-60 space-y-1 overflow-y-auto rounded-xl border border-border/80 bg-card p-2">
                {services.map((service) => {
                  const checked = selectedServiceIds.includes(service.id);

                  const checkboxId = `barber-service-${service.id}`;

                  return (
                    <div
                      key={service.id}
                      className="flex items-start gap-3 rounded-lg px-2.5 py-2 transition-colors hover:bg-muted/60"
                    >
                      <Checkbox
                        id={checkboxId}
                        checked={checked}
                        onCheckedChange={(value) =>
                          toggleService(service.id, value === true)
                        }
                        disabled={isPending}
                        className="mt-0.5"
                        aria-label={`Serviço ${service.name}`}
                      />
                      <label
                        htmlFor={checkboxId}
                        className="min-w-0 flex-1 cursor-pointer"
                      >
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className="text-xs font-medium">
                            {service.name}
                          </span>
                          {!service.is_active ? (
                            <Badge
                              variant="outline"
                              className="text-[10px] text-muted-foreground"
                            >
                              Inativo
                            </Badge>
                          ) : null}
                        </span>
                        <span className="mt-0.5 block text-[10px] text-muted-foreground">
                          {formatCurrencyFromCents(service.price_cents)} ·{" "}
                          {service.duration_minutes} min
                        </span>
                      </label>
                    </div>
                  );
                })}
              </div>
            )}
            {form.formState.errors.serviceIds ? (
              <p className="text-xs text-destructive">
                {form.formState.errors.serviceIds.message}
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancelar
            </Button>
            <Button type="submit" variant="gold" disabled={isPending}>
              {isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <Save className="size-4" />
                  {barber ? "Salvar profissional" : "Cadastrar profissional"}
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
