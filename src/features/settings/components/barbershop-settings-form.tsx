"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Save } from "lucide-react";
import { useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { FormError, FormSuccess } from "@/components/forms/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { updateBarbershopAction } from "@/features/barbershop/actions";
import { applyServerFieldErrors } from "@/lib/form-errors";
import {
  updateBarbershopSchema,
  type UpdateBarbershopInput,
} from "@/lib/validation/barbershop";

export function BarbershopSettingsForm({
  defaultValues,
  timezone,
}: {
  defaultValues: UpdateBarbershopInput;
  timezone: string;
}) {
  const form = useForm<UpdateBarbershopInput>({
    resolver: zodResolver(updateBarbershopSchema),
    defaultValues,
  });

  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const description =
    useWatch({ control: form.control, name: "description" }) ?? "";

  const onSubmit = (values: UpdateBarbershopInput) => {
    setServerError(null);
    setSuccessMessage(null);

    startTransition(async () => {
      const result = await updateBarbershopAction(values);

      if (result.status === "error") {
        setServerError(result.message ?? "Não foi possível salvar os dados.");
        applyServerFieldErrors(form, result.fieldErrors);
        toast.error(result.message ?? "Não foi possível salvar os dados.");
        return;
      }

      setSuccessMessage(result.message ?? "Dados atualizados.");
      toast.success(result.message ?? "Dados atualizados.");
      form.reset(values);
    });
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <FormError message={serverError} />
      <FormSuccess message={successMessage} />

      <div className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="name">Nome da barbearia</Label>
          <Input
            id="name"
            autoComplete="organization"
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
            <Label htmlFor="description">Descrição pública</Label>
            <span className="text-[10px] text-muted-foreground">
              {description.length}/1000
            </span>
          </div>
          <Textarea
            id="description"
            rows={4}
            placeholder="Conte o que torna sua barbearia única."
            className="rounded-xl"
            aria-invalid={Boolean(form.formState.errors.description)}
            disabled={isPending}
            {...form.register("description")}
          />
          {form.formState.errors.description ? (
            <p className="text-xs text-destructive">
              {form.formState.errors.description.message}
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              Texto usado na futura página pública da barbearia.
            </p>
          )}
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="phone">
              Telefone{" "}
              <span className="font-normal text-muted-foreground">
                (opcional)
              </span>
            </Label>
            <Input
              id="phone"
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

          <div className="space-y-2">
            <Label htmlFor="city">Cidade</Label>
            <Input
              id="city"
              autoComplete="address-level2"
              placeholder="São Paulo"
              className="h-11 rounded-xl px-3"
              aria-invalid={Boolean(form.formState.errors.city)}
              disabled={isPending}
              {...form.register("city")}
            />
            {form.formState.errors.city ? (
              <p className="text-xs text-destructive">
                {form.formState.errors.city.message}
              </p>
            ) : null}
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-[1fr_8rem]">
          <div className="space-y-2">
            <Label htmlFor="state">Estado (UF)</Label>
            <Input
              id="state"
              autoComplete="address-level1"
              placeholder="SP"
              maxLength={2}
              className="h-11 rounded-xl px-3 uppercase"
              aria-invalid={Boolean(form.formState.errors.state)}
              disabled={isPending}
              {...form.register("state")}
            />
            {form.formState.errors.state ? (
              <p className="text-xs text-destructive">
                {form.formState.errors.state.message}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="timezone">Fuso</Label>
            <Input
              id="timezone"
              value={timezone}
              readOnly
              disabled
              className="h-11 rounded-xl px-3 text-xs"
              placeholder="Fuso da barbearia"
            />
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-col-reverse gap-2 border-t border-border/70 pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          As alterações são validadas no servidor e na RLS.
        </p>
        <Button
          type="submit"
          variant="gold"
          size="xl"
          disabled={isPending}
          className="sm:min-w-40"
        >
          {isPending ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Salvando...
            </>
          ) : (
            <>
              <Save className="size-4" />
              Salvar alterações
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
