import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronDown,
  Clock3,
  LayoutDashboard,
  LockKeyhole,
  Scissors,
  ShieldCheck,
  UsersRound,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { demoBarbershops } from "@/features/public-barbershop/demo-data";
import "./landing.css";

const demo = demoBarbershops[0];
const demoPath = `/barbearia/${demo.slug}`;

const resources = [
  {
    icon: CalendarDays,
    name: "Agenda online",
    copy: "Veja os horários de cada profissional e compartilhe o link para seus clientes agendarem.",
  },
  {
    icon: UsersRound,
    name: "Equipe e clientes",
    copy: "Organize quem atende, consulte o histórico dos clientes e prepare o próximo atendimento.",
  },
  {
    icon: LayoutDashboard,
    name: "Gestão da barbearia",
    copy: "Acompanhe serviços, valores e atendimentos do dia em um painel da sua barbearia.",
  },
];

const plans = [
  {
    name: "Básico",
    price: "R$ 49,90",
    limit: "1 profissional ativo",
    features: [
      "Agenda online",
      "Cadastro de clientes e serviços",
      "Controle de horários",
    ],
  },
  {
    name: "Profissional",
    price: "R$ 79,90",
    limit: "Até 5 profissionais ativos",
    features: [
      "Tudo do Básico",
      "Relatórios financeiros",
      "Indicadores de desempenho",
    ],
  },
  {
    name: "Premium",
    price: "R$ 119,90",
    limit: "Até 10 profissionais ativos",
    features: [
      "Tudo do Profissional",
      "Relatórios avançados",
      "Prioridade no suporte",
    ],
  },
];

const faq = [
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

export function LandingPage() {
  return (
    <>
      <section className="lp-hero" aria-labelledby="hero-heading">
        <div className="lp-photo">
          <Image
            src="/images/barbearia.webp"
            alt=""
            fill
            preload
            sizes="(min-width: 900px) 68vw, 100vw"
            className="object-cover"
          />
        </div>
        <div className="lp-hero-inner">
          <div className="lp-intro">
            <p className="lp-kicker">
              <span />
              Gestão para barbearias
            </p>
            <h1 id="hero-heading">
              Sua barbearia.
              <br />
              Seu ritmo.
              <br />
              <em>Sua agenda.</em>
            </h1>
            <p className="lp-lead">
              Organize horários, conecte sua equipe e acompanhe cada atendimento
              em um só lugar.
            </p>
            <div className="lp-actions">
              <Button asChild size="xl" variant="gold">
                <Link href="/cadastro">
                  Criar minha conta <ArrowUpRight />
                </Link>
              </Button>
              <Link href={demoPath} className="lp-demo-link">
                Ver demonstração <ArrowRight size={16} />
              </Link>
            </div>
          </div>
          <Link
            href={demoPath}
            className="lp-preview"
            aria-label="Ver serviços da Barbearia Aurora na demonstração"
          >
            <span className="lp-preview-top">
              <span>
                <Scissors size={15} /> Serviço em destaque
              </span>
              <ArrowUpRight size={16} />
            </span>
            <strong>{demo.services[0].name}</strong>
            <span className="lp-preview-meta">
              <Clock3 size={13} /> {demo.services[0].durationMinutes} min <i />{" "}
              Barbearia Aurora · Demo
            </span>
          </Link>
        </div>
      </section>

      <section
        id="recursos"
        className="lp-resource-band"
        aria-label="Recursos para o dia a dia"
      >
        <div className="lp-resource-grid">
          {resources.map(({ icon: Icon, name, copy }) => (
            <article key={name}>
              <Icon size={24} strokeWidth={1.6} />
              <div>
                <h2>{name}</h2>
                <p>{copy}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section id="como-funciona" className="lp-section">
        <div className="lp-split">
          <div>
            <p className="lp-kicker">
              <span />
              Como funciona
            </p>
            <h2 className="lp-title">
              Da sua cadeira
              <br />à tela do cliente.
            </h2>
            <p className="lp-body">
              Cadastre os serviços, defina quem atende e abra seus horários.
              Seus clientes escolhem o que precisam pelo link da sua barbearia.
            </p>
            <Link href={demoPath} className="lp-text-link">
              Explorar a demonstração <ArrowUpRight size={16} />
            </Link>
          </div>
          <div className="lp-demo-panel">
            <div className="lp-demo-header">
              <span className="lp-demo-icon">
                <Scissors />
              </span>
              <div>
                <strong>{demo.name}</strong>
                <small>Catálogo de serviços · Demonstração</small>
              </div>
            </div>
            {demo.services.slice(0, 3).map((service) => (
              <div key={service.name} className="lp-service">
                <strong>{service.name}</strong>
                <span>
                  <Clock3 size={14} /> {service.durationMinutes} min
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="planos" className="lp-plans">
        <div className="lp-section">
          <p className="lp-kicker">
            <span />
            Planos
          </p>
          <h2 className="lp-title">Um plano para cada equipe.</h2>
          <div className="lp-plan-grid">
            {plans.map((plan) => (
              <article
                key={plan.name}
                data-recommended={plan.name === "Profissional"}
              >
                <div className="lp-plan-name">
                  <h3>{plan.name}</h3>
                  {plan.name === "Profissional" && <span>Recomendado</span>}
                </div>
                <p>{plan.limit}</p>
                <div className="lp-price">
                  {plan.price}
                  <small> / mês</small>
                </div>
                <ul>
                  {plan.features.map((feature) => (
                    <li key={feature}>
                      <Check size={16} />
                      {feature}
                    </li>
                  ))}
                </ul>
                <Button
                  asChild
                  size="lg"
                  variant={plan.name === "Profissional" ? "gold" : "outline"}
                >
                  <Link href="/cadastro">
                    Criar conta <ArrowRight />
                  </Link>
                </Button>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="faq" className="lp-section">
        <div className="lp-split">
          <div>
            <ShieldCheck className="mb-4 text-gold" size={28} />
            <h2 className="lp-title">Antes de começar.</h2>
            <p className="lp-body">
              Saiba como sua equipe e seus clientes usam o LPS Agenda.
            </p>
          </div>
          <div className="lp-questions">
            {faq.map(([q, a]) => (
              <details key={q}>
                <summary>
                  {q}
                  <ChevronDown size={18} />
                </summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-final">
        <div>
          <p className="lp-kicker">
            <LockKeyhole size={15} />
            Seu espaço de gestão
          </p>
          <h2>Vamos organizar sua barbearia?</h2>
        </div>
        <Button asChild size="xl" variant="gold">
          <Link href="/cadastro">
            Criar minha conta <ArrowUpRight />
          </Link>
        </Button>
      </section>
    </>
  );
}
