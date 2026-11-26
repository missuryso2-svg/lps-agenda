"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";

import { PasswordInput } from "@/components/forms/password-input";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signUpAction } from "@/features/auth/actions";
import { applyServerFieldErrors } from "@/lib/form-errors";
import { signUpSchema, type SignUpInput } from "@/lib/validation/auth";
import {
  AccountError, AccountField, AccountFieldFeedback, AccountMailResult, AccountSubmit,
  accountFieldAttributes, newPasswordHelp,
} from "./account-form";

export function SignUpForm({ disabled = false }: { disabled?: boolean }) {
  const form = useForm<SignUpInput>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { fullName: "", email: "", password: "", confirmPassword: "", acceptTerms: false },
  });
  const { errors } = form.formState;
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
        return;
      }
      if (result?.status === "success") {
        setSuccessMessage(result.message ?? "Cadastro recebido.");
      }
    });
  };

  if (successMessage) {
    return <AccountMailResult title="Confira seu e-mail" message={successMessage} />;
  }

  return (
    <form className="account-form" method="post" onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <AccountError message={serverError} />
      <AccountField id="fullName" label="Nome completo" error={errors.fullName?.message}>
        <Input
          {...accountFieldAttributes("fullName", errors.fullName?.message)}
          autoComplete="name"
          disabled={disabled}
          {...form.register("fullName")}
        />
      </AccountField>
      <AccountField id="email" label="E-mail" error={errors.email?.message}>
        <Input
          {...accountFieldAttributes("email", errors.email?.message)}
          type="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          disabled={disabled}
          {...form.register("email")}
        />
      </AccountField>
      <AccountField id="password" label="Senha" error={errors.password?.message} help={newPasswordHelp}>
        <PasswordInput
          {...accountFieldAttributes("password", errors.password?.message)}
          autoComplete="new-password"
          disabled={disabled}
          {...form.register("password")}
        />
      </AccountField>
      <AccountField id="confirmPassword" label="Confirmar senha" error={errors.confirmPassword?.message}>
        <PasswordInput
          {...accountFieldAttributes("confirmPassword", errors.confirmPassword?.message)}
          autoComplete="new-password"
          toggleLabel="Mostrar confirmação de senha"
          disabled={disabled}
          {...form.register("confirmPassword")}
        />
      </AccountField>

      <div className="account-consent">
        <Controller
          control={form.control}
          name="acceptTerms"
          render={({ field }) => (
            <Checkbox
              {...accountFieldAttributes("acceptTerms", errors.acceptTerms?.message)}
              name={field.name}
              ref={field.ref}
              checked={field.value}
              onBlur={field.onBlur}
              onCheckedChange={checked => field.onChange(checked === true)}
              disabled={disabled}
            />
          )}
        />
        <div>
          <Label htmlFor="acceptTerms">Li e aceito os termos e a política de privacidade.</Label>
          <p className="account-legal-links">
            <Link href="/termos" className="account-link">Termos de uso</Link>
            <Link href="/privacidade" className="account-link">Política de privacidade</Link>
          </p>
          <AccountFieldFeedback id="acceptTerms" error={errors.acceptTerms?.message} />
        </div>
      </div>

      <AccountSubmit
        label="Criar minha conta"
        pendingLabel="Criando conta..."
        pending={isPending}
        disabled={disabled}
      />
    </form>
  );
}
