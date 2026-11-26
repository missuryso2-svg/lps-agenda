import "server-only";
import Link from "next/link";
import { premiumTrialCTA, premiumTrialEligibility, premiumTrialOffer } from "@/features/premium-trial/copy";
import { PlanBenefits, trialOffer, trialTerms } from "./plan-benefits";
import { ArrowUpRight, CalendarDays, UsersRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  commercialPlans,
  commercialWhatsApp,
  type Inquiry,
} from "./commercial";
import "./landing.css";

export function CommercialContact({
  inquiry = "geral",
  label = "Conversar com a LPS Solutions",
  highlighted = true,
}: {
  inquiry?: Inquiry;
  label?: string;
  highlighted?: boolean;
}) {
  const url = commercialWhatsApp(process.env.LPS_COMMERCIAL_WHATSAPP, inquiry);
  if (!url)
    return (
      <p className="text-sm leading-relaxed text-muted-foreground">
        Canal comercial em configuração.
      </p>
    );
  return (
    <Button asChild size="xl" variant={highlighted ? "gold" : "outline"}>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={label + " pelo WhatsApp (abre em nova aba)"}
      >
        {label} <ArrowUpRight aria-hidden />
      </a>
    </Button>
  );
}

export function CommercialPlans({ trialAvailable = false }: { trialAvailable?: boolean } = {}) {
  return (
    <>
      <p className="lp-body">
        Escolha pelo tamanho da equipe. A LPS Solutions negocia a mensalidade e
        as condições diretamente com sua barbearia.
      </p>
      <p className="lp-trial mt-3 text-sm">
        {trialAvailable ? (
          <><strong>{premiumTrialOffer}</strong> {premiumTrialEligibility}{" "}
            <Link href="/cadastro" className="underline underline-offset-4">{premiumTrialCTA}</Link>
          </>
        ) : <><strong>{trialOffer}</strong> {trialTerms}</>}
      </p>
      <div className="lp-plan-grid">
        {commercialPlans.map((plan) => (
          <article
            key={plan.code}
            data-recommended={plan.code === "profissional"}
          >
            <div className="lp-plan-name">
              <h3>{plan.name}</h3>
              {plan.code === "profissional" && <span>Recomendado</span>}
            </div>
            <p>{plan.description}</p>
            <ul>
              <li>
                <UsersRound size={17} />
                {plan.limit}
              </li>
              <li>
                <CalendarDays size={17} />
                Agenda online por profissional
              </li>
            </ul>
            <strong className="mb-3 text-base">Consulte os valores</strong>
            <CommercialContact
              inquiry={plan.code}
              label={`Consultar ${plan.name}`}
              highlighted={plan.code === "profissional"}
            />
          </article>
        ))}
      </div>
      <PlanBenefits/>
    </>
  );
}
