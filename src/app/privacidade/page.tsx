import type { Metadata } from "next";

import {
  LegalPage,
  type LegalSection,
} from "@/components/marketing/legal-page";

export const metadata: Metadata = {
  title: "Privacidade",
  description:
    "Como o LPS Agenda trata dados de conta e de barbearia, com segurança e isolamento entre barbearias.",
};

const sections: LegalSection[] = [
  {
    id: "escopo",
    title: "1. Escopo desta política",
    paragraphs: [
      "Esta política descreve o tratamento de dados no LPS Agenda, produto da LPS Solutions. Ela cobre a landing page, a autenticação, o onboarding e o painel administrativo.",
      "A página da Barbearia Aurora é uma demonstração estática com dados fictícios. Nenhum dado pessoal é coletado nela.",
    ],
  },
  {
    id: "dados",
    title: "2. Quais dados são tratados",
    paragraphs: [
      "Quando a autenticação está configurada, o Supabase Auth processa e-mail, senha (armazenada de forma criptografada pelo provedor) e metadados necessários à sessão. O perfil da aplicação pode conter nome, e-mail, telefone e avatar.",
      "Para operar uma barbearia, o sistema pode armazenar nome, identificador público, descrição, telefone, endereço, fuso horário e status da barbearia. O painel também organiza equipe, serviços, clientes e agendamentos, com isolamento por barbearia.",
    ],
    bullets: [
      "Dados de conta: e-mail, nome, telefone e avatar.",
      "Dados da barbearia: identificação, contato, endereço e fuso.",
      "Dados operacionais: equipe, serviços, clientes, agenda e financeiro, quando utilizados.",
      "Dados técnicos: cookies de sessão e registro da barbearia ativa.",
    ],
  },
  {
    id: "finalidades",
    title: "3. Para que os dados são usados",
    paragraphs: [
      "Os dados são usados para autenticar o usuário, criar e manter o vínculo com a barbearia, executar a operação contratada, aplicar permissões e manter a segurança da plataforma.",
      "O botão comercial abre o WhatsApp com uma mensagem sobre o plano. O texto sugerido contém apenas informações públicas do produto. Cabe a você decidir se deseja enviá-lo e quais informações compartilhar na conversa.",
    ],
  },
  {
    id: "bases",
    title: "4. Bases legais e transparência",
    paragraphs: [
      "O tratamento observa os princípios da Lei Geral de Proteção de Dados (LGPD), incluindo finalidade, necessidade, transparência e segurança. As bases legais variam conforme o contexto: execução de contrato para a conta e a operação, cumprimento de obrigação legal e legítimo interesse para segurança, sempre com avaliação de impacto.",
      "A barbearia é a controladora dos dados de seus clientes. A LPS Solutions atua como operadora da infraestrutura, seguindo instruções documentadas e aplicando medidas técnicas de proteção.",
    ],
  },
  {
    id: "compartilhamento",
    title: "5. Compartilhamento e operadores",
    paragraphs: [
      "A plataforma utiliza o Supabase como provedor de banco de dados e autenticação. O acesso é feito por chaves públicas no navegador e chaves restritas ao servidor para operações administrativas.",
      "Nenhum dado é vendido. O compartilhamento com terceiros se limita a operadores necessários à prestação do serviço e a hipóteses legais. Contratos legados podem utilizar o Asaas para processar e conciliar cobranças.",
    ],
  },
  {
    id: "cookies",
    title: "6. Cookies e sessão",
    paragraphs: [
      "O sistema usa cookies para manter a sessão autenticada e lembrar a barbearia ativa no painel. Esses cookies são necessários para o funcionamento da área restrita e não são usados para publicidade.",
      "A preferência de tema claro ou escuro é armazenada localmente no navegador. A demonstração pública não depende de cookies de autenticação.",
    ],
  },
  {
    id: "seguranca",
    title: "7. Segurança e isolamento",
    paragraphs: [
      "Todas as tabelas operacionais têm Row Level Security habilitada. O banco verifica o vínculo ativo do usuário antes de liberar leitura ou escrita. O papel de administrador da plataforma é lido de app_metadata do JWT, um campo controlado pelo servidor, e nunca de metadados editáveis pelo usuário.",
      "Chaves de serviço e segredos de gateway permanecem apenas no servidor. A aplicação não envia a chave service role nem o token de webhook ao navegador.",
    ],
  },
  {
    id: "retencao",
    title: "8. Retenção e exclusão",
    paragraphs: [
      "Dados de conta e da barbearia são mantidos enquanto o vínculo existir e enquanto forem necessários à operação ou a obrigações legais. Registros de auditoria podem ser preservados para segurança e rastreabilidade.",
      "A exclusão de uma conta ou barbearia depende de um fluxo administrativo que ainda será implementado. Nesta versão, pedidos devem ser tratados pelos canais oficiais da LPS Solutions quando publicados.",
    ],
  },
  {
    id: "direitos",
    title: "9. Direitos do titular",
    paragraphs: [
      "Nos termos da LGPD, o titular pode solicitar confirmação de tratamento, acesso, correção, anonimização, bloqueio, eliminação, portabilidade e informações sobre compartilhamento, além de opor-se a tratamentos específicos.",
      "Como o cadastro e a edição pelo painel ainda não estão completos, algumas solicitações exigirão atendimento assistido. A LPS Solutions responderá pelos canais oficiais após a publicação da operação comercial.",
    ],
  },
  {
    id: "demonstracao",
    title: "10. Dados da demonstração",
    paragraphs: [
      "A Barbearia Aurora, seus profissionais, serviços, preços, endereço, telefone, avaliações e números exibidos são fictícios. Não correspondem a uma pessoa, negócio ou cliente real.",
      "A demonstração não grava dados, não cria agendamentos e não executa integrações externas.",
    ],
  },
  {
    id: "alteracoes",
    title: "11. Alterações e contato",
    paragraphs: [
      "Esta política será revisada antes da operação comercial e sempre que houver mudança relevante de produto, fornecedor ou tratamento de dados. A data de atualização será exibida no topo da página.",
      "Os canais oficiais de privacidade da LPS Solutions serão publicados junto com a operação comercial.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Política de privacidade"
      intro="Como o LPS Agenda trata dados de conta e de barbearia com isolamento entre barbearias e segurança no banco de dados."
      updatedAt="20 de novembro de 2026"
      sections={sections}
    />
  );
}
