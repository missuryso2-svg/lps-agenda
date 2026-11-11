import {
  Mail,
  Phone,
  Search,
  UserPlus,
  Users,
  UserCheck,
  X,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { DashboardEmpty } from "@/components/dashboard/dashboard-empty";
import { NoticeCard } from "@/components/dashboard/notice-card";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { PrototypeAction } from "@/components/prototype-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getCustomers } from "@/features/dashboard/queries";
import { requireDashboardContext } from "@/lib/auth/dal";
import { formatDateBR, formatPhoneBR } from "@/lib/format";

export const metadata: Metadata = {
  title: "Clientes",
};

type CustomersPageProps = {
  searchParams: Promise<{ q?: string }>;
};

export default async function CustomersPage({ searchParams }: CustomersPageProps) {
  const [params, context] = await Promise.all([
    searchParams,
    requireDashboardContext(),
  ]);

  const shop = context.active.barbershop;
  const search = params.q?.trim().slice(0, 80) ?? "";
  const customers = await getCustomers(shop.id, search);
  const active = customers.filter((customer) => customer.is_active).length;

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Operação"
        title="Clientes"
        description="A base de contatos da barbearia. Nesta etapa, o painel já consulta os registros reais; cadastro e edição entram na sequência."
        actions={
          <PrototypeAction
            triggerLabel="Novo cliente"
            triggerVariant="gold"
            triggerSize="lg"
            title="Cadastro de cliente"
            description="O formulário de cliente ainda não está habilitado nesta fundação. Nenhum dado é enviado ao abrir esta janela."
            steps={[
              {
                title: "Dados de contato",
                description:
                  "Nome, telefone, e-mail e data de nascimento com validação Zod.",
              },
              {
                title: "Histórico",
                description:
                  "Vínculo com os agendamentos e observações internas da equipe.",
              },
              {
                title: "Privacidade",
                description:
                  "Acesso limitado à barbearia ativa pela Row Level Security.",
              },
            ]}
            footnote="O botão é um protótipo identificado, não um cadastro funcional."
          />
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Registros encontrados"
          value={String(customers.length)}
          hint={search ? `Busca por “${search}”` : "Últimos 50 clientes"}
          icon={Users}
          tone="gold"
        />
        <StatCard
          label="Clientes ativos"
          value={String(active)}
          hint="Disponíveis para novos atendimentos"
          icon={UserCheck}
        />
        <StatCard
          label="Com telefone"
          value={String(customers.filter((customer) => customer.phone).length)}
          hint="Contato rápido para confirmação"
          icon={Phone}
        />
      </div>

      <Card>
        <CardHeader className="gap-4 border-b border-border/70 pb-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Base de clientes</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                Consulte por nome ou telefone. A lista mostra até 50 registros.
              </p>
            </div>
            {search ? (
              <Button asChild variant="ghost" size="sm" className="gap-1.5">
                <Link href="/dashboard/clientes">
                  <X className="size-3.5" />
                  Limpar busca
                </Link>
              </Button>
            ) : null}
          </div>

          <form
            action="/dashboard/clientes"
            method="get"
            className="flex flex-col gap-2 sm:flex-row"
            role="search"
          >
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                name="q"
                type="search"
                defaultValue={search}
                placeholder="Buscar por nome ou telefone..."
                aria-label="Buscar clientes"
                className="h-10 rounded-xl pl-9"
              />
            </div>
            <Button type="submit" variant="outline" className="h-10 px-4">
              Buscar
            </Button>
          </form>
        </CardHeader>

        <CardContent className="px-0 pb-0">
          {customers.length > 0 ? (
            <div className="px-4 pb-2">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Contato</TableHead>
                    <TableHead>Cadastro</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customers.map((customer) => (
                    <TableRow key={customer.id}>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <span className="grid size-8 shrink-0 place-items-center rounded-full border border-border/80 bg-muted/40 font-display text-[10px] font-semibold">
                            {customer.full_name
                              .split(/\s+/)
                              .slice(0, 2)
                              .map((part) => part[0])
                              .join("")
                              .toUpperCase()}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-xs font-medium">
                              {customer.full_name}
                            </p>
                            <p className="truncate text-[10px] text-muted-foreground">
                              {customer.email ?? "Sem e-mail"}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5">
                          <Phone className="size-3" />
                          {formatPhoneBR(customer.phone)}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDateBR(customer.created_at, shop.timezone)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            customer.is_active
                              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                              : "border-border bg-muted/50 text-muted-foreground"
                          }
                        >
                          {customer.is_active ? "Ativo" : "Inativo"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="px-4 pb-4">
              <DashboardEmpty
                icon={search ? Search : UserPlus}
                title={
                  search
                    ? "Nenhum cliente encontrado"
                    : "Sua base de clientes começa aqui"
                }
                description={
                  search
                    ? "Tente outro nome ou telefone. A busca considera apenas registros da barbearia ativa."
                    : "Os clientes aparecerão nesta lista assim que forem cadastrados. O cadastro pelo painel será conectado na próxima etapa."
                }
                action={
                  search ? (
                    <Button asChild variant="outline" size="sm">
                      <Link href="/dashboard/clientes">Ver todos os clientes</Link>
                    </Button>
                  ) : (
                    <PrototypeAction
                      triggerLabel="Ver cadastro planejado"
                      triggerSize="sm"
                      title="Cadastro de cliente"
                      description="A estrutura de clientes já existe no banco, com isolamento por barbearia. O formulário entra na próxima etapa."
                      steps={[
                        {
                          title: "Validação no servidor",
                          description:
                            "Schemas Zod e mensagens de erro em português.",
                        },
                        {
                          title: "Dados sensíveis",
                          description:
                            "Cada cliente pertence a uma única barbearia e só é visível para a equipe dela.",
                        },
                      ]}
                    />
                  )
                }
              />
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <NoticeCard icon={Mail} title="Contato preparado">
          O modelo de clientes prevê e-mail e telefone. Nenhuma mensagem é
          enviada nesta versão: notificações e integrações de comunicação ainda
          não estão conectadas.
        </NoticeCard>
        <NoticeCard icon={Users} title="Escopo desta fundação" tone="gold">
          A página entrega consulta, busca e estados vazios. Cadastro, edição,
          inativação e importação de clientes serão implementados sobre esta
          mesma base.
        </NoticeCard>
      </div>
    </div>
  );
}
