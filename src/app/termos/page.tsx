import type { Metadata } from "next";

import {
  LegalPage,
  type LegalSection,
} from "@/components/marketing/legal-page";

export const metadata: Metadata = {
  title: "Termos de uso",
  description:
    "Termos de uso do LPS Agenda, produto da LPS Solutions para gestão de barbearias.",
};

const sections: LegalSection[] = [
  {
    id: "sobre",
    title: "1. Sobre esta versão",
    paragraphs: [
      "O LPS Agenda é um produto da LPS Solutions para gestão de barbearias, com agenda por profissional, cadastro de clientes e serviços e acompanhamento dos atendimentos.",
      "As funcionalidades disponíveis dependem do perfil de acesso e da situação da barbearia. A demonstração apresenta uma experiência ilustrativa.",
    ],
  },
  {
    id: "cadastro",
    title: "2. Cadastro e conta",
    paragraphs: [
      "Para utilizar as áreas autenticadas, é necessário criar uma conta com e-mail válido e senha. O cadastro pode exigir confirmação de e-mail, conforme a configuração do projeto Supabase.",
      "Você é responsável por manter a confidencialidade das credenciais e por informar dados corretos. O acesso a uma barbearia depende de vínculo ativo com ela. A criação da primeira barbearia atribui o papel de proprietário ao usuário autenticado.",
    ],
    bullets: [
      "Não compartilhe sua senha nem o acesso à sua conta.",
      "O e-mail informado deve permitir a recuperação de senha.",
      "Contas e vínculos podem ser suspensos em caso de uso indevido.",
    ],
  },
  {
    id: "uso",
    title: "3. Uso permitido",
    paragraphs: [
      "A plataforma deve ser usada para a gestão legítima de uma barbearia. É proibido tentar acessar dados de outras barbearias, contornar políticas de segurança, automatizar ataques, inserir conteúdo ilícito ou utilizar a demonstração para se passar por um negócio real.",
      "O isolamento entre barbearias é aplicado por Row Level Security no PostgreSQL. Qualquer tentativa de burlar esse isolamento pode resultar em bloqueio e medidas cabíveis.",
    ],
  },
  {
    id: "dados",
    title: "4. Dados da barbearia e dos clientes",
    paragraphs: [
      "O proprietário e a equipe da barbearia são responsáveis pela licitude dos dados que inserem na plataforma, incluindo dados de clientes. O LPS Agenda atua como fornecedor de infraestrutura e deve tratar esses dados conforme as instruções do controlador e a legislação aplicável.",
      "O acesso aos cadastros depende do vínculo do usuário com a barbearia e das permissões do seu perfil.",
    ],
  },
  {
    id: "pagamentos",
    title: "5. Planos e pagamentos",
    paragraphs: [
      "Para novas contratações, a LPS Solutions negocia plano, mensalidade e vencimentos diretamente com a barbearia. O operador financeiro registra o acordo e confirma cada pagamento por Pix após conferir o crédito.",
      "Criar uma conta ou abrir uma conversa comercial não gera mensalidade. As assinaturas legadas do Asaas seguem as condições e o histórico do contrato existente.",
    ],
  },
  {
    id: "demonstracao",
    title: "6. Demonstração",
    paragraphs: [
      "A página da Barbearia Aurora é uma demonstração estática. Nome, equipe, serviços, preços, endereço, telefone e avaliações são fictícios e servem apenas para ilustrar a experiência pública do produto.",
      "Nenhum agendamento é criado pela demonstração e nenhum dado pessoal deve ser inserido nela.",
    ],
  },
  {
    id: "propriedade",
    title: "7. Propriedade intelectual",
    paragraphs: [
      "A marca LPS Agenda, a identidade visual, o código, os textos e os componentes da plataforma pertencem à LPS Solutions ou são utilizados com autorização. O uso da plataforma não transfere propriedade intelectual ao usuário.",
      "Dados inseridos pela barbearia continuam pertencendo ao respectivo negócio, observadas as obrigações legais e contratuais.",
    ],
  },
  {
    id: "disponibilidade",
    title: "8. Disponibilidade e limitações",
    paragraphs: [
      "Esta versão é fornecida em caráter de desenvolvimento, sem garantia de disponibilidade contínua, ausência de erros ou adequação a um objetivo específico. O ambiente pode passar por manutenção, migrações e mudanças de escopo.",
      "A LPS Solutions não se responsabiliza por perdas decorrentes de uso indevido, dados inseridos incorretamente ou indisponibilidade de serviços de terceiros necessários à operação, como o provedor de banco de dados.",
    ],
  },
  {
    id: "alteracoes",
    title: "9. Alterações destes termos",
    paragraphs: [
      "Estes termos serão revisados antes da operação comercial e sempre que houver mudança relevante de produto, cobrança ou tratamento de dados. A data de atualização será exibida no topo da página.",
    ],
  },
  {
    id: "contato",
    title: "10. Contato",
    paragraphs: [
      "Consulte a área de contato na página inicial para verificar a disponibilidade do canal comercial.",
    ],
  },
];

export default function TermsPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Termos de uso"
      intro="Regras de uso do LPS Agenda, um produto da LPS Solutions. Leia com atenção antes de criar sua conta ou configurar uma barbearia."
      updatedAt="20 de novembro de 2026"
      sections={sections}
    />
  );
}
