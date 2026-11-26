"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Save } from "lucide-react";
import { useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { FormError } from "@/components/forms/form-message";
import { Button } from "@/components/ui/button";
import { ManagementDialogContent } from "@/components/dashboard/management-dialog";
import {
  Dialog,
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
  createServiceAction,
  updateServiceAction,
} from "@/features/services/actions";
import type { ManagedService } from "@/features/services/types";
import { applyServerFieldErrors } from "@/lib/form-errors";
import {
  formatCentsToPriceInput,
  serviceFormSchema,
  type ServiceFormValues,
} from "@/lib/validation/services";

function serviceDefaults(service: ManagedService | null): ServiceFormValues {
  return {
    name: service?.name ?? "",
    description: service?.description ?? "",
    price: service ? formatCentsToPriceInput(service.price_cents) : "",
    durationMinutes: service?.duration_minutes ?? 30,
    isActive: service?.is_active ?? true,
  };
}

export function ServiceFormDialog({
  open,
  onOpenChange,
  service,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  service: ManagedService | null;
}) {
  const form = useForm<ServiceFormValues>({
    resolver: zodResolver(serviceFormSchema),
    defaultValues: serviceDefaults(service),
  });
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const description = useWatch({ control: form.control, name: "description" }) ?? "";
  const isActive = useWatch({ control: form.control, name: "isActive" });

  const onSubmit = (values: ServiceFormValues) => {
    setServerError(null);

    startTransition(async () => {
      const result = service
        ? await updateServiceAction(service.id, values)
        : await createServiceAction(values);

      if (result.status === "error") {
        applyServerFieldErrors(form, result.fieldErrors);
        setServerError(result.message ?? "Não foi possível salvar o serviço.");
        toast.error(result.message ?? "Não foi possível salvar o serviço.");
        return;
      }

      toast.success(result.message ?? "Serviço salvo com sucesso.");
      onOpenChange(false);
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <ManagementDialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{service ? "Editar serviço" : "Novo serviço"}</DialogTitle>
          <DialogDescription>
            {service
              ? "Atualize preço, duração e disponibilidade do serviço."
              : "Cadastre um serviço com nome, preço e duração para usar na agenda."}
          </DialogDescription>
        </DialogHeader>

        <form method="post" onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4">
          <FormError message={serverError} />

          <div className="space-y-2">
            <Label htmlFor="service-name">Nome do serviço</Label>
            <Input
              id="service-name"
              placeholder="Corte clássico"
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
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="service-description">Descrição</Label>
              <span className="text-[10px] text-muted-foreground">
                {description.length}/800
              </span>
            </div>
            <Textarea
              id="service-description"
              rows={3}
              placeholder="Detalhes do acabamento, produtos ou tempo de atendimento."
              className="rounded-xl"
              aria-invalid={Boolean(form.formState.errors.description)}
              disabled={isPending}
              {...form.register("description")}
            />
            {form.formState.errors.description ? (
              <p className="text-xs text-destructive">
                {form.formState.errors.description.message}
              </p>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="service-price">Preço (R$)</Label>
              <Input
                id="service-price"
                inputMode="decimal"
                placeholder="45,90"
                className="h-11 rounded-xl px-3 tabular-nums"
                aria-invalid={Boolean(form.formState.errors.price)}
                disabled={isPending}
                {...form.register("price")}
              />
              {form.formState.errors.price ? (
                <p className="text-xs text-destructive">
                  {form.formState.errors.price.message}
                </p>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  Use vírgula para centavos. O valor é gravado em centavos.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="service-duration">Duração (min)</Label>
              <Input
                id="service-duration"
                type="number"
                inputMode="numeric"
                min={5}
                max={600}
                step={1}
                className="h-11 rounded-xl px-3 tabular-nums"
                aria-invalid={Boolean(form.formState.errors.durationMinutes)}
                disabled={isPending}
                {...form.register("durationMinutes", { valueAsNumber: true })}
              />
              {form.formState.errors.durationMinutes ? (
                <p className="text-xs text-destructive">
                  {form.formState.errors.durationMinutes.message}
                </p>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  Entre 5 e 600 minutos.
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 rounded-xl border border-border/80 bg-muted/25 p-3.5">
            <div>
              <Label htmlFor="service-active">Serviço ativo</Label>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                Serviços inativos permanecem no histórico, mas saem da operação.
              </p>
            </div>
            <Switch
              id="service-active"
              checked={Boolean(isActive)}
              onCheckedChange={(checked) =>
                form.setValue("isActive", checked, {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
              disabled={isPending}
              aria-label="Serviço ativo"
            />
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
                  {service ? "Salvar serviço" : "Cadastrar serviço"}
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </ManagementDialogContent>
    </Dialog>
  );
}
