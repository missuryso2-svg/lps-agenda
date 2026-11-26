"use client";

import { ArrowUpRight, Check, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { claimAutomaticTrialWelcome } from "./actions";
import { automaticTrialDisplay, type AutomaticTrial } from "./display";
import "./trial.css";

const benefits = [
  "Até 10 profissionais",
  "Agendamentos online",
  "Gestão completa da barbearia",
  "Equipe, serviços, clientes e financeiro",
  "Sem cartão de crédito",
  "Sem cobrança automática",
];

export function AutomaticTrialDashboard({
  shop, trial, timeZone,
}: {
  shop: string;
  trial: AutomaticTrial;
  timeZone: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const plans = useRef<HTMLAnchorElement>(null);
  const claim = useRef<Promise<boolean> | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const display = automaticTrialDisplay(trial, timeZone, elapsed);

  useEffect(() => {
    if (!trial.running) return;

    const start = performance.now();
    const update = () => setElapsed(performance.now() - start);
    const refresh = window.setInterval(update, 60_000);
    const expires = window.setTimeout(update, Date.parse(trial.ends_at) - Date.parse(trial.observed_at));
    document.addEventListener("visibilitychange", update);
    return () => {
      window.clearInterval(refresh);
      window.clearTimeout(expires);
      document.removeEventListener("visibilitychange", update);
    };
  }, [trial.running, trial.ends_at, trial.observed_at]);

  useEffect(() => {
    if (!trial.welcome_available) return;

    let mounted = true;
    claim.current ??= claimAutomaticTrialWelcome(shop);
    void claim.current.then(open => {
      if (mounted && open && dialog.current && !dialog.current.open) dialog.current.showModal();
    }).catch(() => {
      // A failed welcome acknowledgement never affects dashboard access.
    });
    return () => { mounted = false; };
  }, [shop, trial.welcome_available]);

  return (
    <>
      <section className="trial-notice" aria-labelledby="trial-notice-title">
        <div className="flex min-w-0 items-start gap-3">
          <span className="trial-mark" aria-hidden><Sparkles size={19} /></span>
          <div className="min-w-0">
            <h2 id="trial-notice-title" className="text-sm font-semibold">
              {display.expired ? "Período grátis encerrado" : "Você está experimentando o plano Premium"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{display.message}</p>
            {!display.expired && (
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                <progress
                  className="trial-progress"
                  value={display.progress}
                  max={100}
                  aria-label="Percentual do período grátis já utilizado"
                />
                <p className="text-xs text-muted-foreground">Até {display.endsOn}</p>
              </div>
            )}
            {display.expired && <p className="mt-1 text-xs text-muted-foreground">Novos agendamentos estão bloqueados. As reservas anteriores continuam disponíveis.</p>}
          </div>
        </div>
        <Link
          ref={plans}
          href="/dashboard/plano#contratacao-manual"
          className="focus-ring inline-flex min-h-11 max-w-max items-center gap-2 rounded-md px-2 text-sm font-semibold underline decoration-gold/50 underline-offset-4"
        >
          Planos e contratação <ArrowUpRight size={15} aria-hidden />
        </Link>
      </section>
      {trial.welcome_available && (
        <dialog
          ref={dialog}
          className="trial-dialog"
          aria-labelledby="trial-welcome-title"
          aria-describedby="trial-welcome-description"
          onClose={() => {
            if (document.activeElement === document.body) plans.current?.focus();
          }}
        >
          <span className="trial-mark mb-4" aria-hidden><Sparkles size={22} /></span>
          <h2 id="trial-welcome-title" className="text-sm font-semibold">Bem-vindo ao LPS Agenda!</h2>
          <p className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">Você ganhou 7 dias grátis</p>
          <p id="trial-welcome-description" className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Explore todos os recursos do plano Premium e descubra uma nova maneira de gerenciar sua barbearia.
          </p>
          <ul className="my-5 grid gap-2.5 rounded-xl border border-border bg-muted/30 p-4 text-sm sm:grid-cols-2">
            {benefits.map(benefit => (
              <li key={benefit} className="flex items-start gap-2">
                <Check size={16} className="mt-0.5 shrink-0 text-gold" aria-hidden />
                {benefit}
              </li>
            ))}
          </ul>
          <form method="dialog">
            <Button variant="gold" size="lg" className="min-h-11 w-full sm:w-auto">Começar a explorar</Button>
          </form>
        </dialog>
      )}
    </>
  );
}
