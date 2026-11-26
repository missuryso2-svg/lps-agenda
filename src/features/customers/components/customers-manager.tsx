"use client";
import { CustomerWhatsApp } from "./customer-whatsapp";

import {
  Archive,
  ArchiveRestore,
  CalendarDays,
  Eye,
  Loader2,
  Mail,
  Pencil,
  Phone,
  Plus,
  Search,
  UserPlus,
  X,
} from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { ConfirmDeleteDialog } from "@/components/dashboard/confirm-delete-dialog";
import { DashboardEmpty } from "@/components/dashboard/dashboard-empty";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { setCustomerActiveAction } from "@/features/customers/actions";
import { CustomerDetailsDialog } from "@/features/customers/components/customer-details-dialog";
import { CustomerFormDialog } from "@/features/customers/components/customer-form-dialog";
import type {
  CustomerStats,
  CustomerStatus,
  ManagedCustomer,
} from "@/features/customers/types";
import {
  formatDateBR,
  formatPhoneBR,
  initialsFromName,
} from "@/lib/format";
import { cn } from "@/lib/utils";

function buildHref({
  q,
  status,
  page,
}: {
  q: string;
  status: CustomerStatus;
  page?: number;
}) {
  const params = new URLSearchParams();

  if (q) {
    params.set("q", q);
  }

  if (status !== "active") {
    params.set("status", status);
  }

  if (page && page > 1) {
    params.set("page", String(page));
  }

  const query = params.toString();

  return query ? `/dashboard/clientes?${query}` : "/dashboard/clientes";
}

function statusBadgeClass(isActive: boolean) {
  return isActive
    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
    : "border-border bg-muted/50 text-muted-foreground";
}

export function CustomersManager({
  customers,
  total,
  page,
  pageSize,
  totalPages,
  search,
  status,
  stats,
  timeZone,
  canManage,
  error,
}: {
  customers: ManagedCustomer[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  search: string;
  status: CustomerStatus;
  stats: CustomerStats;
  timeZone: string;
  canManage: boolean;
  error: boolean;
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [dialogKey, setDialogKey] = useState(0);
  const [editing, setEditing] = useState<ManagedCustomer | null>(null);
  const [viewing, setViewing] = useState<ManagedCustomer | null>(null);
  const [archiving, setArchiving] = useState<ManagedCustomer | null>(null);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [pendingRestoreId, setPendingRestoreId] = useState<string | null>(null);
  const [isArchiving, startArchive] = useTransition();
  const [, startRestore] = useTransition();

  const statusFilters: Array<{
    value: CustomerStatus;
    label: string;
    count: number;
  }> = [
    { value: "active", label: "Ativos", count: stats.active },
    { value: "archived", label: "Arquivados", count: stats.archived },
    { value: "all", label: "Todos", count: stats.total },
  ];

  const openCreate = () => {
    setEditing(null);
    setDialogKey((value) => value + 1);
    setFormOpen(true);
  };

  const openEdit = (customer: ManagedCustomer) => {
    setEditing(customer);
    setDialogKey((value) => value + 1);
    setFormOpen(true);
  };

  const confirmArchive = () => {
    if (!archiving) {
      return;
    }

    const target = archiving;
    setArchiveError(null);

    startArchive(async () => {
      const result = await setCustomerActiveAction(target.id, false);

      if (result.status === "error") {
        setArchiveError(
          result.message ?? "Não foi possível arquivar o cliente.",
        );
        toast.error(result.message ?? "Não foi possível arquivar o cliente.");
        return;
      }

      toast.success(result.message ?? "Cliente arquivado.");
      setArchiving(null);
    });
  };

  const restoreCustomer = (customer: ManagedCustomer) => {
    setPendingRestoreId(customer.id);

    startRestore(async () => {
      const result = await setCustomerActiveAction(customer.id, true);

      if (result.status === "error") {
        toast.error(result.message ?? "Não foi possível reativar o cliente.");
        setPendingRestoreId(null);
        return;
      }

      toast.success(result.message ?? "Cliente reativado.");
      setPendingRestoreId(null);
    });
  };

  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  const hasFilters = search.length > 0 || status !== "active";

  return (
    <div>
      <div className="j2-list-toolbar j2-customer-toolbar">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <nav className="j2-list-filters" aria-label="Situação dos clientes">
            {statusFilters.map((filter) => {
              const active = filter.value === status;

              return (
                <Link
                  key={filter.value}
                  aria-current={active ? "page" : undefined}
                  href={buildHref({
                    q: search,
                    status: filter.value,
                  })}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-colors",
                    active
                      ? "border-gold/35 bg-gold-soft/50 text-foreground"
                      : "border-border/80 bg-card text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                  )}
                >
                  {filter.label}
                  <span
                    className={cn(
                      "rounded px-1 text-[10px] tabular-nums",
                      active
                        ? "bg-gold/15 text-gold"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {filter.count}
                  </span>
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center justify-between gap-3 sm:justify-end">
            <p className="text-[11px] text-muted-foreground">
              {total} registro(s)
            </p>
            {canManage ? (
              <Button type="button" variant="gold" size="lg" onClick={openCreate}>
                <Plus className="size-4" />
                Novo cliente
              </Button>
            ) : (
              <Badge variant="outline" className="text-muted-foreground">
                Somente leitura
              </Badge>
            )}
          </div>
        </div>

        <form
          action="/dashboard/clientes"
          method="get"
          role="search"
          className="flex flex-col gap-2 sm:flex-row"
        >
          {status !== "active" ? (
            <input type="hidden" name="status" value={status} />
          ) : null}
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              key={`customer-search-${search}-${status}`}
              name="q"
              type="search"
              data-management-focus
              defaultValue={search}
              placeholder="Buscar por nome, telefone ou e-mail..."
              aria-label="Buscar clientes"
              className="h-10 rounded-xl pl-9"
            />
          </div>
          <Button type="submit" variant="outline" className="h-10 px-4">
            Buscar
          </Button>
          {search ? (
            <Button asChild variant="ghost" className="h-10 px-3">
              <Link href={buildHref({ q: "", status })}>
                <X className="size-3.5" />
                Limpar
              </Link>
            </Button>
          ) : null}
        </form>
      </div>

      {error ? (
        <div className="p-6">
          <div role="alert" className="j2-management-empty">
            <p className="text-sm font-medium">
              Não foi possível carregar os clientes
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              A consulta à barbearia ativa falhou. Tente novamente em instantes.
            </p>
            <Button asChild variant="outline" size="sm" className="mt-4">
              <Link href={buildHref({ q: search, status })}>Tentar novamente</Link>
            </Button>
          </div>
        </div>
      ) : customers.length === 0 ? (
        <div className="p-4">
          <DashboardEmpty
            icon={search ? Search : status === "archived" ? Archive : UserPlus}
            title={
              search
                ? "Nenhum cliente encontrado"
                : status === "archived"
                  ? "Nenhum cliente arquivado"
                  : "Sua base de clientes começa aqui"
            }
            description={
              search
                ? "Tente outro nome, telefone ou e-mail. A busca considera apenas os clientes da barbearia ativa."
                : status === "archived"
                  ? "Clientes arquivados continuam no banco para preservar o histórico e podem ser reativados a qualquer momento."
                  : "Cadastre o primeiro cliente para manter os contatos organizados e preparar os próximos agendamentos."
            }
            action={
              search ? (
                <Button asChild variant="outline" size="sm">
                  <Link href={buildHref({ q: "", status })}>
                    Limpar busca
                  </Link>
                </Button>
              ) : status === "active" && stats.archived > 0 ? (
                <Button asChild variant="outline" size="sm">
                  <Link href={buildHref({ q: "", status: "archived" })}>
                    Ver arquivados
                  </Link>
                </Button>
              ) : canManage && status !== "archived" ? (
                <Button type="button" variant="gold" onClick={openCreate}>
                  <Plus className="size-4" />
                  Cadastrar primeiro cliente
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <>
          <div className="j2-management-table hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Cliente</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead className="hidden lg:table-cell">E-mail</TableHead>
                  <TableHead className="hidden xl:table-cell">
                    Cadastro
                  </TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead className="pr-4 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.map((customer) => (
                  <TableRow
                    key={customer.id}
                    data-inactive={customer.is_active ? undefined : ""}
                  >
                    <TableCell className="pl-4">
                      <button
                        type="button"
                        onClick={() => setViewing(customer)}
                        className="flex min-w-0 items-center gap-2.5 text-left"
                        aria-label={`Ver detalhes de ${customer.full_name}`}
                      >
                        <span className="grid size-8 shrink-0 place-items-center rounded-full border border-border/80 bg-muted/40 font-display text-[10px] font-semibold">
                          {initialsFromName(customer.full_name)}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-xs font-medium hover:underline">
                            {customer.full_name}
                          </span>
                          <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
                            {customer.notes ?? "Sem observações"}
                          </span>
                        </span>
                      </button>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5 tabular-nums">
                        <Phone className="size-3" />
                        {formatPhoneBR(customer.phone)}
                      </span><CustomerWhatsApp phone={customer.phone} name={customer.full_name}/>
                    </TableCell>
                    <TableCell className="hidden max-w-[14rem] truncate text-xs text-muted-foreground lg:table-cell">
                      {customer.email ?? "—"}
                    </TableCell>
                    <TableCell className="hidden text-xs text-muted-foreground xl:table-cell">
                      {formatDateBR(customer.created_at, timeZone)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={statusBadgeClass(customer.is_active)}
                      >
                        {customer.is_active ? "Ativo" : "Arquivado"}
                      </Badge>
                    </TableCell>
                    <TableCell className="pr-4 text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => setViewing(customer)}
                          aria-label={`Ver detalhes de ${customer.full_name}`}
                        >
                          <Eye className="size-3.5" />
                        </Button>
                        {canManage ? (
                          <>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => openEdit(customer)}
                              aria-label={`Editar ${customer.full_name}`}
                            >
                              <Pencil className="size-3.5" />
                            </Button>
                            {customer.is_active ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                                onClick={() => {
                                  setArchiveError(null);
                                  setArchiving(customer);
                                }}
                                aria-label={`Arquivar ${customer.full_name}`}
                              >
                                <Archive className="size-3.5" />
                              </Button>
                            ) : (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                disabled={pendingRestoreId === customer.id}
                                onClick={() => restoreCustomer(customer)}
                                aria-label={`Reativar ${customer.full_name}`}
                              >
                                {pendingRestoreId === customer.id ? (
                                  <Loader2 className="size-3.5 animate-spin" />
                                ) : (
                                  <ArchiveRestore className="size-3.5" />
                                )}
                              </Button>
                            )}
                          </>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="j2-management-mobile md:hidden">
            {customers.map((customer) => (
              <article
                key={customer.id}
                className="j2-management-list-row"
              >
                <div className="flex items-start justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setViewing(customer)}
                    className="flex min-w-0 items-start gap-3 text-left"
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-full border border-border/80 bg-muted/40 font-display text-[10px] font-semibold">
                      {initialsFromName(customer.full_name)}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">
                        {customer.full_name}
                      </span>
                      <span className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                        <Mail className="size-3 shrink-0" />
                        {customer.email ?? "Sem e-mail"}
                      </span>
                    </span>
                  </button>
                  <Badge
                    variant="outline"
                    className={cn(
                      "shrink-0",
                      statusBadgeClass(customer.is_active),
                    )}
                  >
                    {customer.is_active ? "Ativo" : "Arquivado"}
                  </Badge>
                </div>

                <div className="mt-3 space-y-1.5 text-[11px] text-muted-foreground">
                  <p className="inline-flex items-center gap-1.5 tabular-nums">
                    <Phone className="size-3 text-gold" />
                    {formatPhoneBR(customer.phone)}
                  </p><CustomerWhatsApp phone={customer.phone} name={customer.full_name}/>
                  <p className="inline-flex items-center gap-1.5">
                    <CalendarDays className="size-3 text-gold" />
                    Cadastrado em {formatDateBR(customer.created_at, timeZone)}
                  </p>
                </div>

                {customer.notes ? (
                  <p className="mt-2 line-clamp-2 rounded-lg bg-muted/35 px-2.5 py-2 text-[11px] leading-relaxed text-muted-foreground">
                    {customer.notes}
                  </p>
                ) : null}

                <div className="mt-3 flex flex-wrap gap-1 border-t border-border/70 pt-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setViewing(customer)}
                  >
                    <Eye className="size-3.5" />
                    Detalhes
                  </Button>
                  {canManage ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => openEdit(customer)}
                    >
                      <Pencil className="size-3.5" />
                      Editar
                    </Button>
                  ) : null}
                  {canManage ? (
                    customer.is_active ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => {
                          setArchiveError(null);
                          setArchiving(customer);
                        }}
                      >
                        <Archive className="size-3.5" />
                        Arquivar
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={pendingRestoreId === customer.id}
                        onClick={() => restoreCustomer(customer)}
                      >
                        {pendingRestoreId === customer.id ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <ArchiveRestore className="size-3.5" />
                        )}
                        Reativar
                      </Button>
                    )
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </>
      )}

      {!error && total > 0 ? (
        <div className="flex flex-col gap-2 border-t border-border/70 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[11px] text-muted-foreground">
            Mostrando {start}–{end} de {total} cliente(s)
          </p>
          <div className="flex items-center gap-2">
            {page > 1 ? (
              <Button asChild variant="outline" size="sm">
                <Link href={buildHref({ q: search, status, page: page - 1 })}>
                  Anterior
                </Link>
              </Button>
            ) : (
              <Button type="button" variant="outline" size="sm" disabled>
                Anterior
              </Button>
            )}
            <span className="px-1 text-[11px] text-muted-foreground">
              Página {page} de {Math.max(totalPages, 1)}
            </span>
            {page < totalPages ? (
              <Button asChild variant="outline" size="sm">
                <Link href={buildHref({ q: search, status, page: page + 1 })}>
                  Próxima
                </Link>
              </Button>
            ) : (
              <Button type="button" variant="outline" size="sm" disabled>
                Próxima
              </Button>
            )}
          </div>
        </div>
      ) : hasFilters && !error ? (
        <div className="border-t border-border/70 p-4 text-center text-[11px] text-muted-foreground">
          Nenhum registro corresponde aos filtros atuais.
        </div>
      ) : null}

      <CustomerFormDialog
        key={dialogKey}
        open={formOpen}
        onOpenChange={setFormOpen}
        customer={editing}
      />

      <CustomerDetailsDialog
        open={Boolean(viewing)}
        onOpenChange={(open) => {
          if (!open) {
            setViewing(null);
          }
        }}
        customer={viewing}
        timeZone={timeZone}
        canManage={canManage}
        onEdit={openEdit}
      />

      <ConfirmDeleteDialog
        open={Boolean(archiving)}
        onOpenChange={(open) => {
          if (!open) {
            setArchiving(null);
            setArchiveError(null);
          }
        }}
        title="Arquivar cliente?"
        description="O cliente sai da lista ativa, mas o cadastro, as observações e o histórico de agendamentos são preservados. Você poderá reativá-lo depois."
        itemName={
          archiving
            ? `${archiving.full_name} · ${formatPhoneBR(archiving.phone)}`
            : ""
        }
        confirmLabel="Arquivar"
        pendingLabel="Arquivando..."
        pending={isArchiving}
        error={archiveError}
        onConfirm={confirmArchive}
      />
    </div>
  );
}
