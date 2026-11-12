"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Save, ShieldCheck } from "lucide-react";
import { useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { FormError } from "@/components/forms/form-message";
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
  createCustomerAction,
  updateCustomerAction,
} from "@/features/customers/actions";
import type { ManagedCustomer } from "@/features/customers/types";
import { applyServerFieldErrors } from "@/lib/form-errors";
import { formatPhoneBR } from "@/lib/format";
import {
  CUSTOMER_NOTES_MAX,
  customerFormSchema,
  type CustomerFormValues,
} from "@/lib/validation/customers";

function customerDefaults(
  customer: ManagedCustomer | null,
): CustomerFormValues {
  return {
    fullName: customer?.full_name ?? "",
    phone: customer?.phone ? formatPhoneBR(customer.phone) : "",
    email: customer?.email ?? "",
    notes: customer?.notes ?? "",
  };
}

export function CustomerFormDialog({
  open,
  onOpenChange,
  customer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: ManagedCustomer | null;
}) {
  const form = useForm<CustomerFormValues>({
    resolver: zodResolver(customerFormSchema),
    defaultValues: customerDefaults(customer),
  });
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const notes = useWatch({ control: form.control, name: "notes" }) ?? "";

  const onSubmit = (values: CustomerFormValues) => {
    setServerError(null);

    startTransition(async () => {
      const result = customer
        ? await updateCustomerAction(customer.id, values)
        : await createCustomerAction(values);

      if (result.status === "error") {
        applyServerFieldErrors(form, result.fieldErrors);
        setServerError(result.message ?? "Não foi possível salvar o cliente.");
        toast.error(result.message ?? "Não foi possível salvar o cliente.");
        return;
      }

      toast.success(result.message ?? "Cliente salvo com sucesso.");
      onOpenChange(false);
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!isPending) {
          onOpenChange(nextOpen);
        }
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {customer ? "Editar cliente" : "Novo cliente"}
          </DialogTitle>
          <DialogDescription>
            {customer
              ? "Atualize os dados de contato e as observações internas do cliente."
              : "Cadastre os dados de contato do cliente nesta barbearia."}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={form.handleSubmit(onSubmit)}
          noValidate
          className="space-y-4"
        >
          <FormError message={serverError} />

          <div className="space-y-2">
            <Label htmlFor="customer-name">Nome completo</Label>
            <Input
              id="customer-name"
              placeholder="Ana Souza"
              autoComplete="name"
              className="h-11 rounded-xl px-3"
              aria-invalid={Boolean(form.formState.errors.fullName)}
              disabled={isPending}
              {...form.register("fullName")}
            />
            {form.formState.errors.fullName ? (
              <p className="text-xs text-destructive">
                {form.formState.errors.fullName.message}
              </p>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="customer-phone">Telefone</Label>
              <Input
                id="customer-phone"
                type="tel"
                inputMode="tel"
                placeholder="(11) 99999-9999"
                autoComplete="tel"
                className="h-11 rounded-xl px-3 tabular-nums"
                aria-invalid={Boolean(form.formState.errors.phone)}
                disabled={isPending}
                {...form.register("phone")}
              />
              {form.formState.errors.phone ? (
                <p className="text-xs text-destructive">
                  {form.formState.errors.phone.message}
                </p>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  Obrigatório, com DDD. Usado para contato e controle de
                  duplicidade.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="customer-email">E-mail (opcional)</Label>
              <Input
                id="customer-email"
                type="email"
                inputMode="email"
                placeholder="ana@exemplo.com"
                autoComplete="email"
                className="h-11 rounded-xl px-3"
                aria-invalid={Boolean(form.formState.errors.email)}
                disabled={isPending}
                {...form.register("email")}
              />
              {form.formState.errors.email ? (
                <p className="text-xs text-destructive">
                  {form.formState.errors.email.message}
                </p>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  Opcional. Nenhuma mensagem é enviada nesta fase.
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="customer-notes">Observações (opcional)</Label>
              <span className="text-[10px] text-muted-foreground">
                {notes.length}/{CUSTOMER_NOTES_MAX}
              </span>
            </div>
            <Textarea
              id="customer-notes"
              rows={3}
              maxLength={CUSTOMER_NOTES_MAX}
              placeholder="Preferência de horário, detalhes de atendimento..."
              className="rounded-xl"
              aria-invalid={Boolean(form.formState.errors.notes)}
              disabled={isPending}
              {...form.register("notes")}
            />
            {form.formState.errors.notes ? (
              <p className="text-xs text-destructive">
                {form.formState.errors.notes.message}
              </p>
            ) : null}
          </div>

          <div className="flex gap-3 rounded-xl border border-border/80 bg-muted/25 p-3.5">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-gold" />
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Coletamos apenas nome, telefone, e-mail opcional e observações.
              CPF, endereço e data de nascimento não são solicitados nesta fase.
            </p>
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
                  {customer ? "Salvar alterações" : "Cadastrar cliente"}
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
