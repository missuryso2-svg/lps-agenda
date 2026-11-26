import type { Metadata } from "next";

import { ManagementHeading, ManagementSection } from "@/components/dashboard/management-page";
import { OperationMetrics } from "@/components/dashboard/operation-page";
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
    <div className="j2-operation j2-management">
      <ManagementHeading title="Clientes" description="Organize contatos, acompanhe cadastros e encontre quem vai atender." />
      <OperationMetrics label="Resumo da base de clientes" entries={[
        { label: "Ativos", value: String(stats.active), note: "Disponíveis para atendimento" },
        { label: "Arquivados", value: String(stats.archived) },
        { label: "Total de cadastros", value: String(stats.total) },
      ]} />
      <ManagementSection id="base-clientes" title="Base de clientes">
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
      </ManagementSection>
    </div>
  );
}
