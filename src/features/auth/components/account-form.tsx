"use client";

import { ArrowRight, CircleAlert, Loader2, MailCheck } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export const newPasswordHelp = "De 8 a 72 caracteres, com letras e números.";

export function accountFieldAttributes(id: string, error?: string) {
  return { id, "aria-invalid": Boolean(error), "aria-describedby": id + "-feedback" };
}

export function AccountFieldFeedback({ id, error, help }: { id: string; error?: string; help?: string }) {
  return (
    <p id={id + "-feedback"} className="account-field-feedback" data-error={error ? "" : undefined}>
      {error ?? help}
    </p>
  );
}

export function AccountField({
  id,
  label,
  error,
  help,
  action,
  children,
}: {
  id: string;
  label: ReactNode;
  error?: string;
  help?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="account-field">
      <div className="account-label-line">
        <Label htmlFor={id}>{label}</Label>
        {action}
      </div>
      {children}
      <AccountFieldFeedback id={id} error={error} help={help} />
    </div>
  );
}

export function AccountError({ message }: { message?: string | null }) {
  if (!message) return null;

  return (
    <div className="account-notice account-error" role="alert">
      <CircleAlert size={18} aria-hidden />
      <p>{message}</p>
    </div>
  );
}

export function AccountSubmit({
  label,
  pendingLabel,
  pending,
  disabled = false,
}: {
  label: string;
  pendingLabel: string;
  pending: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="account-submit">
      <Button type="submit" variant="gold" size="xl" disabled={disabled || pending}>
        {pending ? pendingLabel : label}
        {pending ? <Loader2 className="account-spinner" aria-hidden /> : <ArrowRight aria-hidden />}
      </Button>
      <span role="status" className="sr-only">{pending ? pendingLabel : ""}</span>
    </div>
  );
}

export function AccountMailResult({
  title,
  message,
  note,
}: {
  title: string;
  message: string;
  note?: string;
}) {
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    heading.current?.focus();
  }, []);

  return (
    <section className="account-result" aria-labelledby="account-result-title">
      <MailCheck size={24} aria-hidden />
      <h2 id="account-result-title" ref={heading} tabIndex={-1}>{title}</h2>
      <p>{message}</p>
      {note && <p className="account-help">{note}</p>}
      <Link href="/login" className="account-link">Voltar para o login <ArrowRight size={16} aria-hidden /></Link>
    </section>
  );
}
