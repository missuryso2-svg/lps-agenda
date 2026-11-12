"use client";

import {
  Loader2,
  Pencil,
  Plus,
  Search,
  Scissors,
  Trash2,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { ConfirmDeleteDialog } from "@/components/dashboard/confirm-delete-dialog";
import { DashboardEmpty } from "@/components/dashboard/dashboard-empty";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  deleteBarberAction,
  setBarberActiveAction,
} from "@/features/barbers/actions";
import { BarberFormDialog } from "@/features/barbers/components/barber-form-dialog";
import type {
  CatalogService,
  ManagedBarber,
} from "@/features/barbers/types";
import {
  formatPhoneBR,
  initialsFromName,
} from "@/lib/format";
import { cn } from "@/lib/utils";

function statusBadgeClass(isActive: boolean) {
  return isActive
    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
    : "border-border bg-muted/50 text-muted-foreground";
}

export function BarbersManager({
  barbers,
  services,
  canManage,
}: {
  barbers: ManagedBarber[];
  services: CatalogService[];
  canManage: boolean;
}) {
  const [query, setQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogKey, setDialogKey] = useState(0);
  const [editing, setEditing] = useState<ManagedBarber | null>(null);
  const [deleting, setDeleting] = useState<ManagedBarber | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [pendingToggleId, setPendingToggleId] = useState<string | null>(null);
  const [isDeleting, startDelete] = useTransition();
  const [, startToggle] = useTransition();

  const servicesById = useMemo(
    () => new Map(services.map((service) => [service.id, service])),
    [services],
  );

  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("pt-BR");

    if (!term) {
      return barbers;
    }

    return barbers.filter((barber) =>
      barber.name.toLocaleLowerCase("pt-BR").includes(term),
    );
  }, [barbers, query]);

  const openCreate = () => {
    setEditing(null);
    setDialogKey((value) => value + 1);
    setDialogOpen(true);
  };

  const openEdit = (barber: ManagedBarber) => {
    setEditing(barber);
    setDialogKey((value) => value + 1);
    setDialogOpen(true);
  };

  const toggleBarber = (barber: ManagedBarber) => {
    setPendingToggleId(barber.id);

    startToggle(async () => {
      const result = await setBarberActiveAction(barber.id, !barber.is_active);

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
      const result = await deleteBarberAction(target.id);

      if (result.status === "error") {
        setDeleteError(result.message ?? "Não foi possível excluir o profissional.");
        toast.error(result.message ?? "Não foi possível excluir o profissional.");
        return;
      }

      toast.success(result.message ?? "Profissional excluído.");
      setDeleting(null);
    });
  };

  return (
    <Card>
      <CardHeader className="border-b border-border/70 pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Profissionais de atendimento</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Quem atende na barbearia e quais serviços cada profissional realiza.
            </p>
          </div>
          {canManage ? (
            <Button type="button" variant="gold" size="lg" onClick={openCreate}>
              <Plus className="size-4" />
              Novo profissional
            </Button>
          ) : (
            <Badge variant="outline" className="w-fit text-muted-foreground">
              Somente leitura
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-4">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por nome"
              aria-label="Buscar profissionais por nome"
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
          <p className="text-[11px] text-muted-foreground">
            {filtered.length} de {barbers.length} profissional(is)
          </p>
        </div>

        {barbers.length === 0 ? (
          <DashboardEmpty
            icon={UsersRound}
            title="Nenhum profissional cadastrado"
            description="Os profissionais são vinculados aos serviços e aos agendamentos. Cadastre quem atende para começar."
            action={
              canManage ? (
                <Button type="button" variant="gold" onClick={openCreate}>
                  <Plus className="size-4" />
                  Cadastrar primeiro profissional
                </Button>
              ) : undefined
            }
          />
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/80 bg-card/45 px-6 py-10 text-center">
            <Search className="mx-auto size-5 text-muted-foreground/70" />
            <p className="mt-3 text-sm font-medium">
              Nenhum profissional encontrado
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Não há profissionais com o nome “{query.trim()}”.
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
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((barber) => {
              const linkedServices = barber.serviceIds
                .map((serviceId) => servicesById.get(serviceId))
                .filter((service): service is CatalogService => Boolean(service));

              return (
                <article
                  key={barber.id}
                  className="flex flex-col rounded-2xl border border-border/80 bg-card p-4"
                >
                  <div className="flex items-start gap-3">
                    <Avatar size="lg">
                      <AvatarFallback className="bg-primary font-display text-xs text-primary-foreground">
                        {initialsFromName(barber.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="truncate text-sm font-medium">
                          {barber.name}
                        </p>
                        <Badge
                          variant="outline"
                          className={cn(statusBadgeClass(barber.is_active))}
                        >
                          {barber.is_active ? "Ativo" : "Inativo"}
                        </Badge>
                      </div>
                      <p className="mt-1 truncate text-[11px] text-muted-foreground">
                        {barber.phone
                          ? formatPhoneBR(barber.phone)
                          : "Telefone não informado"}
                      </p>
                    </div>
                  </div>

                  <p className="mt-3 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
                    {barber.bio ?? "Sem descrição ou especialidade informada."}
                  </p>

                  <div className="mt-3 flex-1">
                    <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      <Scissors className="size-3 text-gold" />
                      Serviços
                    </p>
                    {linkedServices.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {linkedServices.slice(0, 4).map((service) => (
                          <Badge
                            key={service.id}
                            variant="outline"
                            className={cn(
                              "max-w-full truncate text-[10px]",
                              service.is_active
                                ? "border-border bg-muted/35 text-foreground"
                                : "border-border bg-muted/20 text-muted-foreground",
                            )}
                          >
                            {service.name}
                          </Badge>
                        ))}
                        {linkedServices.length > 4 ? (
                          <Badge
                            variant="outline"
                            className="text-[10px] text-muted-foreground"
                          >
                            +{linkedServices.length - 4}
                          </Badge>
                        ) : null}
                      </div>
                    ) : (
                      <p className="mt-2 text-[11px] text-muted-foreground">
                        Nenhum serviço vinculado.
                      </p>
                    )}
                  </div>

                  {canManage ? (
                    <div className="mt-4 flex items-center justify-between border-t border-border/70 pt-3">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={barber.is_active}
                          disabled={pendingToggleId === barber.id}
                          onCheckedChange={() => toggleBarber(barber)}
                          aria-label={
                            barber.is_active
                              ? `Desativar ${barber.name}`
                              : `Ativar ${barber.name}`
                          }
                        />
                        <span className="text-[11px] text-muted-foreground">
                          {pendingToggleId === barber.id ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : barber.is_active ? (
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
                          onClick={() => openEdit(barber)}
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
                            setDeleting(barber);
                          }}
                          aria-label={`Excluir ${barber.name}`}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 flex items-center gap-1.5 border-t border-border/70 pt-3 text-[10px] text-muted-foreground">
                      <UserRound className="size-3" />
                      Gerenciado pelo proprietário
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </CardContent>

      <BarberFormDialog
        key={dialogKey}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        barber={editing}
        services={services}
      />

      <ConfirmDeleteDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open) {
            setDeleting(null);
            setDeleteError(null);
          }
        }}
        title="Excluir profissional?"
        description="Esta ação remove o profissional e desfaz os vínculos com serviços. Agendamentos existentes impedem a exclusão."
        itemName={deleting?.name ?? ""}
        pending={isDeleting}
        error={deleteError}
        onConfirm={confirmDelete}
      />
    </Card>
  );
}
