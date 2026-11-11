export type DemoService = {
  name: string;
  description: string;
  durationMinutes: number;
  priceCents: number;
};

export type DemoProfessional = {
  name: string;
  role: string;
  bio: string;
};

export type DemoBarbershop = {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  neighborhood: string;
  city: string;
  address: string;
  phone: string;
  hours: { label: string; value: string }[];
  services: DemoService[];
  team: DemoProfessional[];
  stats: { value: string; label: string }[];
  reviews: { name: string; text: string; context: string }[];
};

/**
 * Conteúdo fictício usado apenas para demonstrar a experiência visual.
 * Não representa uma barbearia real, não contém clientes reais e não é
 * carregado do banco de dados.
 */
export const demoBarbershops: DemoBarbershop[] = [
  {
    slug: "barbearia-aurora",
    name: "Barbearia Aurora",
    tagline: "Tradição no corte. Precisão no ritmo.",
    description:
      "Um espaço de bairro com atendimento próximo, técnica apurada e uma rotina que respeita o seu tempo. Esta é uma demonstração visual do que o LPS Agenda pode apresentar ao cliente final.",
    neighborhood: "Jardins",
    city: "São Paulo · SP",
    address: "Rua das Palmeiras, 128 — Jardins, São Paulo/SP",
    phone: "(00) 0000-0000",
    hours: [
      { label: "Segunda a sexta", value: "09h — 20h" },
      { label: "Sábado", value: "09h — 18h" },
      { label: "Domingo", value: "Fechado" },
    ],
    services: [
      {
        name: "Corte clássico",
        description:
          "Leitura do formato do rosto, corte na tesoura e finalização com produtos de fixação leve.",
        durationMinutes: 45,
        priceCents: 7000,
      },
      {
        name: "Barba desenhada",
        description:
          "Toalha quente, óleo pré-barba, navalha e contorno desenhado para valorizar o formato.",
        durationMinutes: 30,
        priceCents: 5000,
      },
      {
        name: "Corte + barba",
        description:
          "A experiência completa da casa, com tempo dedicado ao corte e à barba no mesmo atendimento.",
        durationMinutes: 75,
        priceCents: 11000,
      },
      {
        name: "Corte infantil",
        description:
          "Atendimento paciente para os primeiros cortes, com acabamento suave e ambiente acolhedor.",
        durationMinutes: 30,
        priceCents: 6000,
      },
    ],
    team: [
      {
        name: "Rafael Moraes",
        role: "Barbeiro fundador",
        bio: "Cortes clássicos, tesoura e navalha. Mais de uma década de cadeira e escuta.",
      },
      {
        name: "Marina Costa",
        role: "Especialista em barba",
        bio: "Desenho de barba, cuidado com a pele e acabamento em detalhes.",
      },
      {
        name: "Caio Nunes",
        role: "Barbeiro",
        bio: "Texturas, cortes modernos e atendimento infantil com paciência.",
      },
    ],
    stats: [
      { value: "12", label: "anos de histórias" },
      { value: "3", label: "profissionais" },
      { value: "4,9", label: "nota ilustrativa" },
    ],
    reviews: [
      {
        name: "Lucas P.",
        context: "Cliente fictício · corte clássico",
        text: "Atendimento pontual, ambiente tranquilo e um corte que se sustenta bem durante a semana. A experiência da demonstração mostra exatamente o que procuro.",
      },
      {
        name: "André M.",
        context: "Cliente fictício · barba desenhada",
        text: "O cuidado com a barba faz diferença. Gostei da clareza dos horários e da possibilidade de escolher o profissional.",
      },
      {
        name: "Felipe R.",
        context: "Cliente fictício · corte + barba",
        text: "Uma rotina simples de entender: serviços com tempo real, preço claro e uma página que passa confiança antes do primeiro contato.",
      },
    ],
  },
];

export function getDemoBarbershop(slug: string): DemoBarbershop | undefined {
  return demoBarbershops.find((shop) => shop.slug === slug);
}
