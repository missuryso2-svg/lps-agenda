import Image from "next/image";
import Link from "next/link";
import {
  ArrowDownRight, ArrowUpRight, CalendarDays, ChevronDown,
  Clock3, LayoutDashboard, UsersRound,
} from "lucide-react";

import { demoBarbershops } from "@/features/public-barbershop/demo-data";
import { CommercialContact, CommercialPlans } from "./commercial-plans";
import { premiumTrialCTA, premiumTrialDescription, premiumTrialEligibility, premiumTrialOffer, premiumTrialTerms } from "@/features/premium-trial/copy";
import { trialOffer, trialTerms } from "./plan-benefits";
import "./landing-j2.css";

const demo = demoBarbershops[0];
const demoPath = "/barbearia/" + demo.slug;
const services = demo.services.slice(0, 3);

const resources = [
  {
    icon: CalendarDays,
    name: "Agenda online",
    copy: "Veja os horários por profissional e compartilhe o link para seus clientes agendarem.",
  },
  {
    icon: UsersRound,
    name: "Equipe e clientes",
    copy: "Organize quem atende, consulte o histórico dos clientes e prepare o próximo atendimento.",
  },
  {
    icon: LayoutDashboard,
    name: "Gestão da barbearia",
    copy: "Acompanhe serviços, valores e atendimentos do dia no painel da sua barbearia.",
  },
];

const faq = [
  [
    "Como contratar o LPS Agenda?",
    "Escolha o plano pelo número de profissionais e solicite uma proposta pelo canal comercial, quando disponível. A LPS Solutions combina as condições com você e registra o acordo.",
  ],
  [
    "Como funcionam os planos e os valores?",
    "O Básico atende 1 profissional ativo, o Profissional até 5 e o Premium até 10. A mensalidade é definida na proposta para a sua barbearia.",
  ],
  [
    "Como funciona o pagamento por Pix?",
    "Após o acordo, a equipe financeira registra a mensalidade e orienta o pagamento. Um operador autorizado confere o crédito e confirma a parcela.",
  ],
  ["Existe teste gratuito?", ""],
  [
    "Posso mudar de plano?",
    "Converse com a LPS Solutions para avaliar o novo limite e as condições. A mudança depende de revisão do acordo.",
  ],
  [
    "Como meus clientes agendam?",
    "Você configura serviços, profissionais e horários. Com a agenda disponível, o cliente abre o link da barbearia e escolhe um atendimento.",
  ],
  [
    "Quem pode acessar os dados da barbearia?",
    "Cada barbearia tem seu próprio espaço. O proprietário gerencia a operação, e os membros da equipe acessam as funções permitidas para o seu perfil.",
  ],
  [
    "Posso usar o LPS Agenda no celular?",
    "Sim. A agenda e o painel funcionam pelo navegador no celular, no tablet e no computador.",
  ],
];

function AgendaPreview() {
  return (
    <figure className="j2-agenda">
      <figcaption className="j2-agenda-caption">
        <span><CalendarDays size={18} aria-hidden /> Agenda do dia</span>
        <span>Prévia ilustrativa</span>
      </figcaption>
      <div className="j2-agenda-title">
        <strong>Barbearia Aurora</strong>
        <span>Horário local</span>
      </div>
      <ol className="j2-slots">
        {["09:00", "09:45", "10:30"].map((time, index) => {
          const service = index === 1 ? undefined : services[index];
          return (
            <li key={time}>
              <time>{time}</time>
              <div className="j2-slot" data-available={!service}>
                <strong>{service?.name ?? "Horário disponível"}</strong>
                <span>{service ? service.durationMinutes + " min" : "Livre"}</span>
              </div>
            </li>
          );
        })}
      </ol>
      <Link href={demoPath} className="j2-agenda-link">
        Abrir a Barbearia Aurora <ArrowUpRight size={16} aria-hidden />
      </Link>
    </figure>
  );
}

export function LandingPage({ trialAvailable }: { trialAvailable: boolean }) {
  return (
    <>
      <section className="j2-wrap j2-hero" aria-labelledby="hero-heading">
        <div>
          <p className="j2-kicker"><span aria-hidden /> Gestão para barbearias</p>
          <h1 id="hero-heading">O dia da sua barbearia, <em>em ordem.</em></h1>
          <p className="j2-lead">
            Organize a equipe, veja quem atende em cada horário e deixe seus
            clientes agendarem pelo link da sua barbearia.
          </p>
          {trialAvailable && (
            <p className="j2-lead"><strong>{premiumTrialOffer}</strong> {premiumTrialDescription}</p>
          )}
          <div className="j2-actions">
            {trialAvailable ? (
              <Link href="/cadastro" className="j2-button">{premiumTrialCTA} <ArrowUpRight size={18} aria-hidden /></Link>
            ) : (
              <Link href="#planos" className="j2-button">
                Conhecer os planos <ArrowDownRight size={18} aria-hidden />
              </Link>
            )}
            <Link href={demoPath} className="j2-text-link">
              Ver demonstração <ArrowUpRight size={17} aria-hidden />
            </Link>
          </div>
          {trialAvailable && <p className="mt-3 text-sm text-muted-foreground">{premiumTrialTerms}</p>}
        </div>
        <AgendaPreview />
      </section>

      <section id="recursos" className="j2-benefits" aria-labelledby="recursos-heading">
        <div className="j2-wrap">
          <h2 id="recursos-heading" className="j2-section-title">Da primeira reserva ao fim do expediente.</h2>
          <div className="j2-benefit-grid">
            {resources.map(({ icon: Icon, name, copy }) => (
              <article key={name}>
                <Icon size={23} strokeWidth={1.6} aria-hidden />
                <h3>{name}</h3>
                <p>{copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="como-funciona" className="j2-wrap j2-demo" aria-labelledby="demo-heading">
        <picture className="j2-photo">
          <source
            srcSet="/images/barbearia-480.webp 480w, /images/barbearia-768.webp 768w, /images/barbearia.webp 1536w"
            sizes="(max-width: 42rem) 91vw, (max-width: 82rem) 43vw, 34rem"
            type="image/webp"
          />
          <Image
            src="/images/barbearia-768.webp"
            alt="Barbeiro atendendo um cliente na barbearia"
            width={768}
            height={512}
            unoptimized
          />
        </picture>
        <div>
          <p className="j2-kicker"><span aria-hidden /> Como funciona</p>
          <h2 id="demo-heading" className="j2-section-title">Da sua cadeira à tela do cliente.</h2>
          <ol className="j2-steps">
            <li>Cadastre os serviços e defina quem atende.</li>
            <li>Abra os horários e compartilhe seu link.</li>
            <li>O cliente escolhe o serviço e o horário disponível.</li>
          </ol>
          <div className="j2-demo-catalog">
            <h3>{demo.name} <small>Demonstração</small></h3>
            <ul>
              {services.map(service => (
                <li key={service.name}>
                  <span>{service.name}</span>
                  <span><Clock3 size={14} aria-hidden /> {service.durationMinutes} min</span>
                </li>
              ))}
            </ul>
          </div>
          <Link href={demoPath} className="j2-text-link j2-demo-cta">
            Explorar a demonstração <ArrowUpRight size={17} aria-hidden />
          </Link>
        </div>
      </section>

      <section id="planos" className="j2-plans" aria-labelledby="planos-heading">
        <div className="j2-wrap">
          <p className="j2-kicker"><span aria-hidden /> Planos</p>
          <h2 id="planos-heading" className="j2-section-title">Um plano para cada equipe.</h2>
          <CommercialPlans trialAvailable={trialAvailable} />
        </div>
      </section>

      <section id="faq" className="j2-wrap j2-faq" aria-labelledby="faq-heading">
        <div>
          <p className="j2-kicker"><span aria-hidden /> Perguntas frequentes</p>
          <h2 id="faq-heading" className="j2-section-title">Antes de começar.</h2>
        </div>
        <div className="j2-questions">
          {faq.map(([question, answer]) => (
            <details key={question}>
              <summary>{question}<ChevronDown size={18} aria-hidden /></summary>
              <p>{answer || (trialAvailable
                ? premiumTrialOffer + " " + premiumTrialEligibility + " " + premiumTrialTerms
                : trialOffer + " " + trialTerms)}</p>
            </details>
          ))}
        </div>
      </section>

      <section id="contato" className="j2-wrap" aria-labelledby="contato-heading">
        <div className="j2-contact">
          <div>
            <h2 id="contato-heading" className="j2-section-title">Pronto para organizar sua barbearia?</h2>
            <p>Converse sobre a equipe, os valores e as condições para começar.</p>
          </div>
          <CommercialContact />
        </div>
      </section>
    </>
  );
}
