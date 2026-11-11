"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, Loader2 } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { FormError } from "@/components/forms/form-message";
import { PasswordInput } from "@/components/forms/password-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signInAction } from "@/features/auth/actions";
import { applyServerFieldErrors } from "@/lib/form-errors";
import { loginSchema, type LoginInput } from "@/lib/validation/auth";

export function LoginForm({
  nextPath,
  disabled = false,
}: {
  nextPath?: string;
  disabled?: boolean;
}) {
  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const onSubmit = (values: LoginInput) => {
    setServerError(null);

    startTransition(async () => {
      const result = await signInAction(values, nextPath);

      if (result?.status === "error") {
        setServerError(result.message ?? "Não foi possível entrar.");
        applyServerFieldErrors(form, result.fieldErrors);
        toast.error(result.message ?? "Não foi possível entrar.");
      }
    });
  };

  const busy = disabled || isPending;

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <FormError message={serverError} />

      <div className="space-y-5">
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
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Senha</Label>
            <Link
              href="/recuperar-senha"
              className="text-xs font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-gold hover:underline"
            >
              Esqueci minha senha
            </Link>
          </div>
          <PasswordInput
            id="password"
            autoComplete="current-password"
            placeholder="Sua senha"
            className="h-11 rounded-xl px-3"
            aria-invalid={Boolean(form.formState.errors.password)}
            disabled={disabled}
            {...form.register("password")}
          />
          {form.formState.errors.password ? (
            <p className="text-xs text-destructive">
              {form.formState.errors.password.message}
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
            Entrando...
          </>
        ) : (
          <>
            Entrar
            <ArrowRight className="size-4" />
          </>
        )}
      </Button>

      {disabled ? (
        <p className="mt-3 text-center text-[11px] text-muted-foreground">
          O formulário será habilitado quando o Supabase estiver configurado.
        </p>
      ) : null}
    </form>
  );
}
