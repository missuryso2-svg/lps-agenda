"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { Input } from "@/components/ui/input";
import { forgotPasswordAction } from "@/features/auth/actions";
import { applyServerFieldErrors } from "@/lib/form-errors";
import { forgotPasswordSchema, type ForgotPasswordInput } from "@/lib/validation/auth";
import {
  AccountError, AccountField, AccountMailResult, AccountSubmit, accountFieldAttributes,
} from "./account-form";

export function ForgotPasswordForm({ disabled = false }: { disabled?: boolean }) {
  const form = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });
  const error = form.formState.errors.email?.message;
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
      }
      if (result?.status === "success") {
        setSuccessMessage(result.message ?? "Verifique seu e-mail.");
      }
    });
  };

  if (successMessage) {
    return (
      <AccountMailResult
        title="Verifique seu e-mail"
        message={successMessage}
        note="O link expira em até 1 hora e só pode ser usado uma vez."
      />
    );
  }

  return (
    <form className="account-form" method="post" onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <AccountError message={serverError} />
      <AccountField id="email" label="E-mail da conta" error={error}>
        <Input
          {...accountFieldAttributes("email", error)}
          type="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          disabled={disabled}
          {...form.register("email")}
        />
      </AccountField>
      <AccountSubmit
        label="Enviar link de recuperação"
        pendingLabel="Enviando..."
        pending={isPending}
        disabled={disabled}
      />
    </form>
  );
}
