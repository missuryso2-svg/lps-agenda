"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { PasswordInput } from "@/components/forms/password-input";
import { resetPasswordAction } from "@/features/auth/actions";
import { applyServerFieldErrors } from "@/lib/form-errors";
import { resetPasswordSchema, type ResetPasswordInput } from "@/lib/validation/auth";
import {
  AccountError, AccountField, AccountSubmit, accountFieldAttributes, newPasswordHelp,
} from "./account-form";

export function ResetPasswordForm() {
  const form = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });
  const { errors } = form.formState;
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const onSubmit = (values: ResetPasswordInput) => {
    setServerError(null);

    startTransition(async () => {
      const result = await resetPasswordAction(values);
      if (result?.status === "error") {
        setServerError(result.message ?? "Não foi possível alterar a senha.");
        applyServerFieldErrors(form, result.fieldErrors);
      }
    });
  };

  return (
    <form className="account-form" method="post" onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <AccountError message={serverError} />
      <AccountField id="password" label="Nova senha" error={errors.password?.message} help={newPasswordHelp}>
        <PasswordInput
          {...accountFieldAttributes("password", errors.password?.message)}
          autoComplete="new-password"
          {...form.register("password")}
        />
      </AccountField>
      <AccountField id="confirmPassword" label="Confirmar nova senha" error={errors.confirmPassword?.message}>
        <PasswordInput
          {...accountFieldAttributes("confirmPassword", errors.confirmPassword?.message)}
          autoComplete="new-password"
          toggleLabel="Mostrar confirmação de senha"
          {...form.register("confirmPassword")}
        />
      </AccountField>
      <AccountSubmit label="Salvar nova senha" pendingLabel="Salvando..." pending={isPending} />
    </form>
  );
}
