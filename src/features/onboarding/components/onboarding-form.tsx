"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";

import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AccountError, AccountField, AccountSubmit, accountFieldAttributes,
} from "@/features/auth/components/account-form";
import { createBarbershopAction } from "@/features/barbershop/actions";
import { applyServerFieldErrors } from "@/lib/form-errors";
import { slugify } from "@/lib/slug";
import { createBarbershopSchema, type CreateBarbershopInput } from "@/lib/validation/barbershop";

const timezones = [
  { value: "America/Sao_Paulo", label: "Brasília · São Paulo (GMT-3)" },
  { value: "America/Manaus", label: "Manaus (GMT-4)" },
  { value: "America/Cuiaba", label: "Cuiabá (GMT-4)" },
  { value: "America/Belem", label: "Belém (GMT-3)" },
  { value: "America/Fortaleza", label: "Fortaleza (GMT-3)" },
  { value: "America/Recife", label: "Recife (GMT-3)" },
  { value: "America/Rio_Branco", label: "Rio Branco (GMT-5)" },
  { value: "America/Noronha", label: "Fernando de Noronha (GMT-2)" },
];

export function OnboardingForm({ manualUserId }: { manualUserId: string | null }) {
  const form = useForm<CreateBarbershopInput>({
    resolver: zodResolver(createBarbershopSchema),
    defaultValues: { name: "", slug: "", phone: "", timezone: "America/Sao_Paulo" },
  });
  const { errors } = form.formState;
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const slugEdited = useRef(false);
  const name = useWatch({ control: form.control, name: "name" }) ?? "";

  useEffect(() => {
    if (!slugEdited.current) {
      form.setValue("slug", slugify(name), { shouldValidate: false });
    }
  }, [name, form]);

  const slugRegistration = form.register("slug");

  const onSubmit = (values: CreateBarbershopInput) => {
    setServerError(null);
    let intent: string | undefined;
    if (manualUserId) {
      // Keep the attempt across reloads without storing contact data.
      try {
        const key = "lps.onboarding." + manualUserId + "." + values.slug;
        intent = sessionStorage.getItem(key) ?? crypto.randomUUID();
        sessionStorage.setItem(key, intent);
      } catch {
        setServerError("Permita o armazenamento nesta aba para recuperar o cadastro com segurança.");
        return;
      }
    }

    startTransition(async () => {
      const result = await createBarbershopAction(values, intent);
      if (result?.status === "error") {
        setServerError(result.message ?? "Não foi possível criar a barbearia.");
        applyServerFieldErrors(form, result.fieldErrors);
      }
    });
  };

  return (
    <form className="account-form" method="post" onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <AccountError message={serverError} />

      <AccountField id="name" label="Nome da barbearia" error={errors.name?.message}>
        <Input
          {...accountFieldAttributes("name", errors.name?.message)}
          autoComplete="organization"
          placeholder="Ex.: Barbearia Aurora"
          disabled={isPending}
          {...form.register("name")}
        />
      </AccountField>

      <AccountField
        id="slug"
        label="Identificador"
        error={errors.slug?.message}
        help="Use letras minúsculas, números e hífens no link de agendamento."
        action={
          <button
            type="button"
            className="account-link"
            disabled={isPending}
            onClick={() => {
              slugEdited.current = false;
              form.setValue("slug", slugify(form.getValues("name")), { shouldValidate: true });
            }}
          >
            Recriar a partir do nome
          </button>
        }
      >
        <div className="account-url" data-invalid={errors.slug ? "" : undefined}>
          <span aria-hidden>/agendar/</span>
          <Input
            {...accountFieldAttributes("slug", errors.slug?.message)}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="barbearia-aurora"
            disabled={isPending}
            {...slugRegistration}
            onChange={event => {
              slugEdited.current = true;
              slugRegistration.onChange(event);
            }}
          />
        </div>
      </AccountField>

      <div className="account-field-pair">
        <AccountField
          id="phone"
          label={<>Telefone <span className="account-help">(opcional)</span></>}
          error={errors.phone?.message}
        >
          <Input
            {...accountFieldAttributes("phone", errors.phone?.message)}
            type="tel"
            autoComplete="tel"
            placeholder="(11) 99999-9999"
            disabled={isPending}
            {...form.register("phone")}
          />
        </AccountField>
        <AccountField id="timezone" label="Fuso horário" error={errors.timezone?.message}>
          <Controller
            control={form.control}
            name="timezone"
            render={({ field }) => (
              <Select name={field.name} value={field.value} onValueChange={field.onChange} disabled={isPending}>
                <SelectTrigger
                  {...accountFieldAttributes("timezone", errors.timezone?.message)}
                  ref={field.ref}
                  onBlur={field.onBlur}
                >
                  <SelectValue placeholder="Selecione o fuso" />
                </SelectTrigger>
                <SelectContent className="account-select-menu">
                  {timezones.map(timezone => (
                    <SelectItem key={timezone.value} value={timezone.value}>{timezone.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </AccountField>
      </div>

      <p className="account-help">Você terá acesso ao painel como proprietário da barbearia.</p>
      <AccountSubmit label="Criar barbearia e continuar" pendingLabel="Criando barbearia..." pending={isPending} />
      <p className="account-help">
        Ao continuar, você concorda com os <Link href="/termos" className="account-link">Termos de uso</Link>.
      </p>
    </form>
  );
}
