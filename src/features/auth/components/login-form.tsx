"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { PasswordInput } from "@/components/forms/password-input";
import { Input } from "@/components/ui/input";
import { signInAction } from "@/features/auth/actions";
import { applyServerFieldErrors } from "@/lib/form-errors";
import { loginSchema, type LoginInput } from "@/lib/validation/auth";
import { AccountError, AccountField, AccountSubmit, accountFieldAttributes } from "./account-form";

export function LoginForm({ nextPath, disabled = false }: { nextPath?: string; disabled?: boolean }) {
  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });
  const { errors } = form.formState;
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const onSubmit = (values: LoginInput) => {
    setServerError(null);

    startTransition(async () => {
      const result = await signInAction(values, nextPath);
      if (result?.status === "error") {
        setServerError(result.message ?? "Não foi possível entrar.");
        applyServerFieldErrors(form, result.fieldErrors);
      }
    });
  };

  return (
    <form className="account-form" method="post" onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <AccountError message={serverError} />
      <AccountField id="email" label="E-mail" error={errors.email?.message}>
        <Input
          {...accountFieldAttributes("email", errors.email?.message)}
          type="email"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          disabled={disabled}
          {...form.register("email")}
        />
      </AccountField>
      <AccountField id="password" label="Senha" error={errors.password?.message}>
        <PasswordInput
          {...accountFieldAttributes("password", errors.password?.message)}
          autoComplete="current-password"
          disabled={disabled}
          {...form.register("password")}
        />
      </AccountField>
      <Link href="/recuperar-senha" className="account-link account-recovery-link">Esqueci minha senha</Link>
      <AccountSubmit label="Entrar" pendingLabel="Entrando..." pending={isPending} disabled={disabled} />
    </form>
  );
}
