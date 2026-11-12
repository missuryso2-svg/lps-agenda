import {
  Archive,
  ShieldCheck,
  UserCheck,
  Users,
} from "lucide-react";
import type { Metadata } from "next";

import { NoticeCard } from "@/components/dashboard/notice-card";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CustomersManager } from "@/features/customers/components/customers-manager";
import {
  getCustomerStats,
  getCustomersPage,
  parseCustomerStatus,
} from "@/features/dashboard/queries";
import {
  isCurrentUserPlatformAdmin,
  requireDashboardContext,
} from "@/lib/auth/dal";
import { canOperateShop } from "@/lib/auth/permissions";

export const metadata: Metadata = {
  title: "Clientes",
};

type CustomersPageProps = {
  searchParams: Promise<{
    q?: string;
    status?: string;
    page?: string;
  }>;
};

export default async function CustomersPage({
  searchParams,
}: CustomersPageProps) {
  const [params, context] = await Promise.all([
    searchParams,
    requireDashboardContext(),
  ]);

  const shop = context.active.barbershop;
  const search = (params.q ?? "").trim().slice(0, 80);
  const status = parseCustomerStatus(params.status);
  const parsedPage = Number.parseInt(params.page ?? "1", 10);
  const page =
    Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;

  const [list, stats] = await Promise.all([
    getCustomersPage({
      barbershopId: shop.id,
      search,
      status,
      page,
    }),
    getCustomerStats(shop.id),
  ]);

  const canManage =
    canOperateShop(context.active.role) ||
    isCurrentUserPlatformAdmin(context.user);

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Operação"
        title="Clientes"
        description="Cadastre, consulte e mantenha os dados de contato da base da barbearia. A busca, os filtros e a paginação são executados no servidor e respeitam a barbearia ativa."
        actions={
          <Badge variant="outline" className="w-fit">
            <Users className="size-3.5 text-gold" />
            {stats.total} cadastro(s) na base
          </Badge>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Clientes ativos"
          value={String(stats.active)}
          hint="Disponíveis para novos atendimentos"
          icon={UserCheck}
          tone="gold"
        />
        <StatCard
          label="Arquivados"
          value={String(stats.archived)}
          hint="Preservados para consulta e reativação"
          icon={Archive}
          tone="muted"
        />
        <StatCard
          label="Total de cadastros"
          value={String(stats.total)}
          hint="Ativos e arquivados nesta barbearia"
          icon={Users}
        />
      </div>

      <Card>
        <CardHeader className="border-b border-border/70 pb-4">
          <CardTitle>Base de clientes</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Pesquise por nome, telefone ou e-mail e filtre por situação. Cada
            consulta retorna somente clientes de {shop.name}.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <CustomersManager
            customers={list.rows}
            total={list.total}
            page={list.page}
            pageSize={list.pageSize}
            totalPages={list.totalPages}
            search={search}
            status={status}
            stats={stats}
            timeZone={shop.timezone || "America/Sao_Paulo"}
            canManage={canManage}
            error={list.error}
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <NoticeCard icon={ShieldCheck} title="Isolamento por barbearia">
          Leitura e escrita são filtradas pelo <code>barbershop_id</code> da
          sessão. A RLS é a barreira final e nenhum formulário envia o tenant
          como fonte de autorização.
        </NoticeCard>
        <NoticeCard icon={Archive} title="Arquivamento preserva histórico" tone="gold">
          Clientes arquivados saem da operação diária, mas permanecem no banco.
          Agendamentos existentes não são apagados e o cadastro pode ser
          reativado depois.
        </NoticeCard>
        <NoticeCard icon={ShieldCheck} title="Minimização de dados">
          Coletamos apenas nome, telefone, e-mail opcional e observações. CPF,
          endereço e data de nascimento não são solicitados nesta fase.
        </NoticeCard>
      </div>
    </div>
  );
}
