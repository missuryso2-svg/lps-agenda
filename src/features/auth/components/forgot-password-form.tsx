"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, Loader2, MailCheck } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { FormError } from "@/components/forms/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { forgotPasswordAction } from "@/features/auth/actions";
import { applyServerFieldErrors } from "@/lib/form-errors";
import {
  forgotPasswordSchema,
  type ForgotPasswordInput,
} from "@/lib/validation/auth";

export function ForgotPasswordForm({
  disabled = false,
}: {
  disabled?: boolean;
}) {
  const form = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const onSubmit = (values: ForgotPasswordInput) => {
    setServerError(null);

    startTransition(async () => {
      const result = await forgotPasswordAction(values);

      if (result?.status === "error") {
        setServerError(result.message ?? "Não foi possível enviar o e-mail.");
        applyServerFieldErrors(form, result.fieldErrors);
        toast.error(result.message ?? "Não foi possível enviar o e-mail.");
        return;
      }

      if (result?.status === "success") {
        setSuccessMessage(result.message ?? "Verifique seu e-mail.");
        toast.success("Solicitação registrada.");
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
          Verifique seu e-mail
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {successMessage}
        </p>
        <Button asChild variant="outline" size="xl" className="mt-5 w-full">
          <Link href="/login">
            Voltar para o login
            <ArrowRight className="size-4" />
          </Link>
        </Button>
        <p className="mt-3 text-center text-[11px] text-muted-foreground">
          O link expira em até 1 hora e só pode ser usado uma vez.
        </p>
      </div>
    );
  }

  const busy = disabled || isPending;

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <FormError message={serverError} />

      <div className="space-y-2">
        <Label htmlFor="email">E-mail da conta</Label>
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

      <Button
        type="submit"
        size="xl"
        variant="gold"
        className="mt-6 w-full"
        disabled={busy}
      >
        {isPending ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Enviando...
          </>
        ) : (
          <>
            Enviar link de recuperação
            <ArrowRight className="size-4" />
          </>
        )}
      </Button>

      <p className="mt-3 text-center text-[11px] text-muted-foreground">
        Por segurança, a resposta é a mesma para e-mails cadastrados ou não.
      </p>
    </form>
  );
}
