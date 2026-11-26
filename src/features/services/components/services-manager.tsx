"use client";

import {
  Banknote,
  Clock3,
  Loader2,
  Pencil,
  Plus,
  Search,
  Scissors,
  Trash2,
  X,
} from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { ConfirmDeleteDialog } from "@/components/dashboard/confirm-delete-dialog";
import { DashboardEmpty } from "@/components/dashboard/dashboard-empty";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  deleteServiceAction,
  setServiceActiveAction,
} from "@/features/services/actions";
import { ServiceFormDialog } from "@/features/services/components/service-form-dialog";
import type { ManagedService } from "@/features/services/types";
import { formatCurrencyFromCents } from "@/lib/format";
import { cn } from "@/lib/utils";

function statusBadgeClass(isActive: boolean) {
  return isActive
    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
    : "border-border bg-muted/50 text-muted-foreground";
}

export function ServicesManager({
  services,
  canManage,
}: {
  services: ManagedService[];
  canManage: boolean;
}) {
  const [query, setQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogKey, setDialogKey] = useState(0);
  const [editing, setEditing] = useState<ManagedService | null>(null);
  const [deleting, setDeleting] = useState<ManagedService | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [pendingToggleId, setPendingToggleId] = useState<string | null>(null);
  const [isDeleting, startDelete] = useTransition();
  const [, startToggle] = useTransition();

  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("pt-BR");

    if (!term) {
      return services;
    }

    return services.filter((service) =>
      service.name.toLocaleLowerCase("pt-BR").includes(term),
    );
  }, [query, services]);

  const openCreate = () => {
    setEditing(null);
    setDialogKey((value) => value + 1);
    setDialogOpen(true);
  };

  const openEdit = (service: ManagedService) => {
    setEditing(service);
    setDialogKey((value) => value + 1);
    setDialogOpen(true);
  };

  const toggleService = (service: ManagedService) => {
    setPendingToggleId(service.id);

    startToggle(async () => {
      const result = await setServiceActiveAction(service.id, !service.is_active);

      if (result.status === "error") {
        toast.error(result.message ?? "Não foi possível alterar o status.");
      } else {
        toast.success(result.message ?? "Status atualizado.");
      }

      setPendingToggleId(null);
    });
  };

  const confirmDelete = () => {
    if (!deleting) {
      return;
    }

    const target = deleting;
    setDeleteError(null);

    startDelete(async () => {
      const result = await deleteServiceAction(target.id);

      if (result.status === "error") {
        setDeleteError(result.message ?? "Não foi possível excluir o serviço.");
        toast.error(result.message ?? "Não foi possível excluir o serviço.");
        return;
      }

      toast.success(result.message ?? "Serviço excluído.");
      setDeleting(null);
    });
  };

  return (
    <div>
      <div className="j2-list-toolbar j2-list-toolbar-inline">
        <div className="relative w-full sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por nome"
            aria-label="Buscar serviços por nome" data-management-focus
            className="h-10 rounded-xl pl-9 pr-9"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Limpar busca"
              className="absolute right-2.5 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-3 sm:justify-end">
          <p className="text-[11px] text-muted-foreground">
            {filtered.length} de {services.length} serviço(s)
          </p>
          {canManage ? (
            <Button type="button" variant="gold" size="lg" onClick={openCreate}>
              <Plus className="size-4" />
              Novo serviço
            </Button>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">
              Somente leitura
            </Badge>
          )}
        </div>
      </div>

      {services.length === 0 ? (
        <div className="p-4">
          <DashboardEmpty
            icon={Scissors}
            title="Nenhum serviço cadastrado"
            description="O catálogo é a base da agenda: nome, duração e preço definem cada horário. Cadastre o primeiro serviço para começar."
            action={
              canManage ? (
                <Button type="button" variant="gold" onClick={openCreate}>
                  <Plus className="size-4" />
                  Cadastrar primeiro serviço
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : filtered.length === 0 ? (
        <div className="p-6">
          <div className="j2-management-empty">
            <Search className="mx-auto size-5 text-muted-foreground/70" />
            <p className="mt-3 text-sm font-medium">Nenhum serviço encontrado</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Não há serviços com o nome “{query.trim()}”.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => setQuery("")}
            >
              Limpar busca
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="j2-management-table hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Serviço</TableHead>
                  <TableHead>Duração</TableHead>
                  <TableHead>Preço</TableHead>
                  <TableHead>Status</TableHead>
                  {canManage ? (
                    <TableHead className="pr-4 text-right">Ações</TableHead>
                  ) : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((service) => (
                  <TableRow key={service.id}>
                    <TableCell className="max-w-md pl-4 whitespace-normal">
                      <p className="j2-list-name">{service.name}</p>
                      <p className="mt-0.5 line-clamp-2 text-[10px] text-muted-foreground">
                        {service.description ?? "Sem descrição"}
                      </p>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {service.duration_minutes} min
                    </TableCell>
                    <TableCell className="j2-service-price">
                      {formatCurrencyFromCents(service.price_cents)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className={statusBadgeClass(service.is_active)}
                        >
                          {service.is_active ? "Ativo" : "Inativo"}
                        </Badge>
                        {canManage ? (
                          <Switch
                            checked={service.is_active}
                            disabled={pendingToggleId === service.id}
                            onCheckedChange={() => toggleService(service)}
                            aria-label={
                              service.is_active
                                ? `Desativar ${service.name}`
                                : `Ativar ${service.name}`
                            }
                          />
                        ) : null}
                      </div>
                    </TableCell>
                    {canManage ? (
                      <TableCell className="pr-4 text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => openEdit(service)}
                            aria-label={`Editar ${service.name}`}
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => {
                              setDeleteError(null);
                              setDeleting(service);
                            }}
                            aria-label={`Excluir ${service.name}`}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="j2-management-mobile md:hidden">
            {filtered.map((service) => (
              <article
                key={service.id}
                className="j2-management-list-row"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="j2-list-name">{service.name}</p>
                    <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
                      {service.description ?? "Sem descrição"}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn("shrink-0", statusBadgeClass(service.is_active))}
                  >
                    {service.is_active ? "Ativo" : "Inativo"}
                  </Badge>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Clock3 className="size-3 text-gold" />
                    {service.duration_minutes} min
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Banknote className="size-3 text-gold" />
                    {formatCurrencyFromCents(service.price_cents)}
                  </span>
                </div>

                {canManage ? (
                  <div className="mt-4 flex items-center justify-between border-t border-border/70 pt-3">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={service.is_active}
                        disabled={pendingToggleId === service.id}
                        onCheckedChange={() => toggleService(service)}
                        aria-label={
                          service.is_active
                            ? `Desativar ${service.name}`
                            : `Ativar ${service.name}`
                        }
                      />
                      <span className="text-[11px] text-muted-foreground">
                        {pendingToggleId === service.id ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : service.is_active ? (
                          "Ativo"
                        ) : (
                          "Inativo"
                        )}
                      </span>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => openEdit(service)}
                      >
                        <Pencil className="size-3.5" />
                        Editar
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => {
                          setDeleteError(null);
                          setDeleting(service);
                        }}
                      >
                        <Trash2 className="size-3.5" />
                        Excluir
                      </Button>
                    </div>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </>
      )}

      <ServiceFormDialog
        key={dialogKey}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        service={editing}
      />

      <ConfirmDeleteDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open) {
            setDeleting(null);
            setDeleteError(null);
          }
        }}
        title="Excluir serviço?"
        description="Esta ação remove o serviço do catálogo e desfaz as associações com profissionais. Agendamentos existentes impedem a exclusão."
        itemName={deleting?.name ?? ""}
        pending={isDeleting}
        error={deleteError}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
