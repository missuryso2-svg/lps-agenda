"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { FormError } from "@/components/forms/form-message";
import { PasswordInput } from "@/components/forms/password-input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { resetPasswordAction } from "@/features/auth/actions";
import { applyServerFieldErrors } from "@/lib/form-errors";
import {
  resetPasswordSchema,
  type ResetPasswordInput,
} from "@/lib/validation/auth";

export function ResetPasswordForm() {
  const form = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      password: "",
      confirmPassword: "",
    },
  });

  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const onSubmit = (values: ResetPasswordInput) => {
    setServerError(null);

    startTransition(async () => {
      const result = await resetPasswordAction(values);

      if (result?.status === "error") {
        setServerError(result.message ?? "Não foi possível alterar a senha.");
        applyServerFieldErrors(form, result.fieldErrors);
        toast.error(result.message ?? "Não foi possível alterar a senha.");
      }
    });
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <FormError message={serverError} />

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="password">Nova senha</Label>
          <PasswordInput
            id="password"
            autoComplete="new-password"
            placeholder="Crie uma nova senha"
            className="h-11 rounded-xl px-3"
            aria-invalid={Boolean(form.formState.errors.password)}
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
          <Label htmlFor="confirmPassword">Confirmar nova senha</Label>
          <PasswordInput
            id="confirmPassword"
            autoComplete="new-password"
            placeholder="Repita a nova senha"
            className="h-11 rounded-xl px-3"
            aria-invalid={Boolean(form.formState.errors.confirmPassword)}
            {...form.register("confirmPassword")}
          />
          {form.formState.errors.confirmPassword ? (
            <p className="text-xs text-destructive">
              {form.formState.errors.confirmPassword.message}
            </p>
          ) : null}
        </div>
      </div>

      <Button
        type="submit"
        size="xl"
        variant="gold"
        className="mt-6 w-full"
        disabled={isPending}
      >
        {isPending ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Salvando...
          </>
        ) : (
          <>
            Salvar nova senha
            <ArrowRight className="size-4" />
          </>
        )}
      </Button>
    </form>
  );
}
