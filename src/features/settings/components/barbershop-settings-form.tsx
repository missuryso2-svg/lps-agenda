"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Save } from "lucide-react";
import { useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";

import { FormError, FormSuccess } from "@/components/forms/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { updateBarbershopAction } from "@/features/barbershop/actions";
import { applyServerFieldErrors } from "@/lib/form-errors";
import { updateBarbershopSchema, type UpdateBarbershopInput } from "@/lib/validation/barbershop";

export function BarbershopSettingsForm({ defaultValues }: { defaultValues: UpdateBarbershopInput }) {
  const form = useForm<UpdateBarbershopInput>({
    resolver: zodResolver(updateBarbershopSchema),
    defaultValues,
  });
  const { errors } = form.formState;
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const description = useWatch({ control: form.control, name: "description" }) ?? "";

  function onSubmit(values: UpdateBarbershopInput) {
    setServerError(null);
    setSuccessMessage(null);
    startTransition(async () => {
      try {
        const result = await updateBarbershopAction(values);
        if (result.status === "error") {
          setServerError(result.message ?? "Não foi possível salvar os dados.");
          applyServerFieldErrors(form, result.fieldErrors);
          return;
        }
        setSuccessMessage(result.message ?? "Dados atualizados.");
        form.reset(values);
      } catch {
        setServerError("Não foi possível confirmar a alteração. Confira os dados antes de tentar novamente.");
      }
    });
  }

  return (
    <form method="post" onSubmit={form.handleSubmit(onSubmit)} noValidate className="mt-5 space-y-6">
      <fieldset className="min-w-0 space-y-4" disabled={isPending}>
        <legend className="mb-3 text-sm font-semibold">Identificação</legend>
        <div className="space-y-2">
          <Label htmlFor="name">Nome da barbearia</Label>
          <Input id="name" autoComplete="organization" aria-invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? "name-error" : undefined} {...form.register("name")} />
          {errors.name && <p id="name-error" className="text-sm text-destructive">{errors.name.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="description">Descrição pública</Label>
          <Textarea id="description" rows={4} placeholder="Ex.: Cortes e barba com hora marcada."
            aria-invalid={Boolean(errors.description)} aria-describedby="description-feedback"
            {...form.register("description")} />
          <p id="description-feedback" className={errors.description ? "text-sm text-destructive" : "j2-c3-meta"}>
            {errors.description?.message ?? description.length + "/1000 caracteres"}
          </p>
        </div>
      </fieldset>

      <fieldset className="min-w-0 space-y-4 border-t pt-4" disabled={isPending}>
        <legend className="mb-3 text-sm font-semibold">Contato e localização</legend>
        <div className="space-y-2">
          <Label htmlFor="phone">Telefone (opcional)</Label>
          <Input id="phone" type="tel" autoComplete="tel" placeholder="(11) 99999-9999"
            aria-invalid={Boolean(errors.phone)} aria-describedby={errors.phone ? "phone-error" : undefined}
            {...form.register("phone")} />
          {errors.phone && <p id="phone-error" className="text-sm text-destructive">{errors.phone.message}</p>}
        </div>
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_8rem]">
          <div className="space-y-2">
            <Label htmlFor="city">Cidade</Label>
            <Input id="city" autoComplete="address-level2" aria-invalid={Boolean(errors.city)}
              aria-describedby={errors.city ? "city-error" : undefined} {...form.register("city")} />
            {errors.city && <p id="city-error" className="text-sm text-destructive">{errors.city.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="state">Estado (UF)</Label>
            <Input id="state" autoComplete="address-level1" maxLength={2} className="uppercase"
              aria-invalid={Boolean(errors.state)} aria-describedby={errors.state ? "state-error" : undefined}
              {...form.register("state")} />
            {errors.state && <p id="state-error" className="text-sm text-destructive">{errors.state.message}</p>}
          </div>
        </div>
      </fieldset>

      <div className="space-y-3 border-t pt-4">
        <FormError message={serverError} />
        <FormSuccess message={successMessage} />
        <Button type="submit" variant="gold" size="lg" disabled={isPending} className="w-full sm:w-auto">
          {isPending ? <Loader2 className="motion-safe:animate-spin" aria-hidden /> : <Save aria-hidden />}
          {isPending ? "Salvando…" : "Salvar alterações"}
        </Button>
      </div>
    </form>
  );
}
