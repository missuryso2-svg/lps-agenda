"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, Loader2, LockKeyhole } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { FormError } from "@/components/forms/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createBarbershopAction } from "@/features/barbershop/actions";
import { applyServerFieldErrors } from "@/lib/form-errors";
import { slugify } from "@/lib/slug";
import {
  createBarbershopSchema,
  type CreateBarbershopInput,
} from "@/lib/validation/barbershop";

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
    defaultValues: {
      name: "",
      slug: "",
      phone: "",
      timezone: "America/Sao_Paulo",
    },
  });

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
      // This tab retains a registration attempt across reloads/lost responses.
      // A different slug starts a distinct shop registration. No contact data is stored.
      try {
        const key = `lps.onboarding.${manualUserId}.${values.slug}`;
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
        toast.error(result.message ?? "Não foi possível criar a barbearia.");
      }
    });
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <FormError message={serverError} />

      <div className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="name">Nome da barbearia</Label>
          <Input
            id="name"
            autoComplete="organization"
            placeholder="Ex.: Barbearia Aurora"
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
            <Label htmlFor="slug">Identificador</Label>
            <button
              type="button"
              onClick={() => {
                slugEdited.current = false;
                form.setValue("slug", slugify(form.getValues("name")), {
                  shouldValidate: true,
                });
              }}
              className="text-[11px] font-medium text-muted-foreground underline-offset-4 hover:text-gold hover:underline"
            >
              Recriar a partir do nome
            </button>
          </div>
          <div className="flex items-center overflow-hidden rounded-xl border border-input bg-transparent transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
            <span className="shrink-0 border-r border-border/80 bg-muted/35 px-3 py-3 font-mono text-[11px] text-muted-foreground">
              /barbearia/
            </span>
            <Input
              id="slug"
              autoComplete="off"
              spellCheck={false}
              placeholder="barbearia-aurora"
              className="h-11 rounded-none border-0 bg-transparent px-3 focus-visible:ring-0"
              aria-invalid={Boolean(form.formState.errors.slug)}
              disabled={isPending}
              {...slugRegistration}
              onChange={(event) => {
                slugEdited.current = true;
                slugRegistration.onChange(event);
              }}
            />
          </div>
          {form.formState.errors.slug ? (
            <p className="text-xs text-destructive">
              {form.formState.errors.slug.message}
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              Letras minúsculas, números e hífens. O link público personalizado
              entra em uma próxima etapa.
            </p>
          )}
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="phone">
              Telefone <span className="font-normal text-muted-foreground">(opcional)</span>
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
            <Label>Fuso horário</Label>
            <Controller
              control={form.control}
              name="timezone"
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                  disabled={isPending}
                >
                  <SelectTrigger
                    className="h-11 w-full rounded-xl px-3"
                    aria-invalid={Boolean(form.formState.errors.timezone)}
                  >
                    <SelectValue placeholder="Selecione o fuso" />
                  </SelectTrigger>
                  <SelectContent>
                    {timezones.map((timezone) => (
                      <SelectItem key={timezone.value} value={timezone.value}>
                        {timezone.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {form.formState.errors.timezone ? (
              <p className="text-xs text-destructive">
                {form.formState.errors.timezone.message}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex items-start gap-2.5 rounded-xl border border-gold/25 bg-gold-soft/35 px-3.5 py-3">
          <LockKeyhole className="mt-0.5 size-4 shrink-0 text-gold" />
          <div>
            <p className="text-xs font-medium">Você será o proprietário</p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              O papel de proprietário permite editar a barbearia e gerenciar a
              equipe. A regra é imposta pelo banco de dados.
            </p>
          </div>
        </div>
      </div>

      <Button
        type="submit"
        size="xl"
        variant="gold"
        className="mt-7 w-full"
        disabled={isPending}
      >
        {isPending ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Criando barbearia...
          </>
        ) : (
          <>
            Criar barbearia e continuar
            <ArrowRight className="size-4" />
          </>
        )}
      </Button>

      <p className="mt-3 text-center text-[11px] text-muted-foreground">
        Ao continuar, você concorda com os{" "}
        <Link
          href="/termos"
          className="underline decoration-gold/50 underline-offset-4 hover:text-gold"
        >
          Termos de uso
        </Link>
        .
      </p>
    </form>
  );
}
