"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, CircleCheck, Loader2, MailCheck } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { FormError } from "@/components/forms/form-message";
import { PasswordInput } from "@/components/forms/password-input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signUpAction } from "@/features/auth/actions";
import { applyServerFieldErrors } from "@/lib/form-errors";
import { signUpSchema, type SignUpInput } from "@/lib/validation/auth";

export function SignUpForm({ disabled = false }: { disabled?: boolean }) {
  const form = useForm<SignUpInput>({
    resolver: zodResolver(signUpSchema),
    defaultValues: {
      fullName: "",
      email: "",
      password: "",
      confirmPassword: "",
      acceptTerms: false,
    },
  });

  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const onSubmit = (values: SignUpInput) => {
    setServerError(null);

    startTransition(async () => {
      const result = await signUpAction(values);

      if (result?.status === "error") {
        setServerError(result.message ?? "Não foi possível criar a conta.");
        applyServerFieldErrors(form, result.fieldErrors);
        toast.error(result.message ?? "Não foi possível criar a conta.");
        return;
      }

      if (result?.status === "success") {
        setSuccessMessage(result.message ?? "Cadastro recebido.");
        toast.success("Cadastro recebido. Confira seu e-mail.");
      }
    });
  };

  if (successMessage) {
    return (
      <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-6">
        <span className="grid size-11 place-items-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
          <MailCheck className="size-5" />
        </span>
        <h2 className="mt-4 font-display text-2xl tracking-tight">
          Confira seu e-mail
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {successMessage}
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <Button asChild variant="outline" size="xl">
            <Link href="/login">
              Voltar para o login
              <ArrowRight className="size-4" />
            </Link>
          </Button>
          <p className="text-center text-[11px] text-muted-foreground">
            Se o e-mail já estava cadastrado, nenhuma nova conta será criada.
          </p>
        </div>
      </div>
    );
  }

  const busy = disabled || isPending;

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <FormError message={serverError} />

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="fullName">Nome completo</Label>
          <Input
            id="fullName"
            autoComplete="name"
            placeholder="Como você se chama"
            className="h-11 rounded-xl px-3"
            aria-invalid={Boolean(form.formState.errors.fullName)}
            disabled={disabled}
            {...form.register("fullName")}
          />
          {form.formState.errors.fullName ? (
            <p className="text-xs text-destructive">
              {form.formState.errors.fullName.message}
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">E-mail</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="voce@barbearia.com.br"
            className="h-11 rounded-xl px-3"
            aria-invalid={Boolean(form.formState.errors.email)}
            disabled={disabled}
            {...form.register("email")}
          />
          {form.formState.errors.email ? (
            <p className="text-xs text-destructive">
              {form.formState.errors.email.message}
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Senha</Label>
          <PasswordInput
            id="password"
            autoComplete="new-password"
            placeholder="Crie uma senha"
            className="h-11 rounded-xl px-3"
            aria-invalid={Boolean(form.formState.errors.password)}
            disabled={disabled}
            {...form.register("password")}
          />
          {form.formState.errors.password ? (
            <p className="text-xs text-destructive">
              {form.formState.errors.password.message}
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              Mínimo de 8 caracteres, com letras e números.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirmar senha</Label>
          <PasswordInput
            id="confirmPassword"
            autoComplete="new-password"
            placeholder="Repita a senha"
            className="h-11 rounded-xl px-3"
            aria-invalid={Boolean(form.formState.errors.confirmPassword)}
            disabled={disabled}
            {...form.register("confirmPassword")}
          />
          {form.formState.errors.confirmPassword ? (
            <p className="text-xs text-destructive">
              {form.formState.errors.confirmPassword.message}
            </p>
          ) : null}
        </div>

        <div className="space-y-2 pt-1">
          <div className="flex items-start gap-2.5">
            <Controller
              control={form.control}
              name="acceptTerms"
              render={({ field }) => (
                <Checkbox
                  id="acceptTerms"
                  checked={field.value}
                  onCheckedChange={(checked) =>
                    field.onChange(checked === true)
                  }
                  disabled={disabled}
                  aria-invalid={Boolean(form.formState.errors.acceptTerms)}
                  className="mt-0.5"
                />
              )}
            />
            <Label
              htmlFor="acceptTerms"
              className="text-xs leading-relaxed font-normal text-muted-foreground"
            >
              Li e aceito os{" "}
              <Link
                href="/termos"
                className="text-foreground underline decoration-gold/60 underline-offset-4 hover:text-gold"
              >
                Termos de uso
              </Link>{" "}
              e a{" "}
              <Link
                href="/privacidade"
                className="text-foreground underline decoration-gold/60 underline-offset-4 hover:text-gold"
              >
                Política de privacidade
              </Link>
              .
            </Label>
          </div>
          {form.formState.errors.acceptTerms ? (
            <p className="text-xs text-destructive">
              {form.formState.errors.acceptTerms.message}
            </p>
          ) : null}
        </div>
      </div>

      <Button
        type="submit"
        size="xl"
        variant="gold"
        className="mt-7 w-full"
        disabled={busy}
      >
        {isPending ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Criando conta...
          </>
        ) : (
          <>
            Criar minha conta
            <ArrowRight className="size-4" />
          </>
        )}
      </Button>

      <div className="mt-4 flex items-start gap-2 rounded-xl border border-dashed border-border bg-muted/25 px-3 py-2.5 text-[11px] text-muted-foreground">
        <CircleCheck className="mt-0.5 size-3.5 shrink-0 text-gold" />
        O acesso ao painel exige confirmação de e-mail e a criação de uma
        barbearia no primeiro acesso.
      </div>
    </form>
  );
}
