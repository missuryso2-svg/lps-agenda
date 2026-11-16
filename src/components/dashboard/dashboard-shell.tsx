"use client";

import {
  Bell,
  CalendarClock,
  CalendarDays,
  Check,
  ChevronsUpDown,
  CreditCard,
  ExternalLink,
  LayoutDashboard,
  LogOut,
  Menu,
  Scissors,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
  UsersRound,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/brand/theme-toggle";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { signOutAction } from "@/features/auth/actions";
import { setActiveBarbershopAction } from "@/features/barbershop/actions";
import { roleLabels, type AppRole } from "@/lib/auth/permissions";
import { initialsFromName } from "@/lib/format";
import { cn } from "@/lib/utils";

type MembershipSummary = {
  id: string;
  name: string;
  slug: string;
  role: AppRole;
};

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  ownerOnly?: boolean;
  exact?: boolean;
};

const operationNav: NavItem[] = [
  { href: "/dashboard", label: "Visão geral", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/agenda", label: "Agenda", icon: CalendarDays },
  { href: "/dashboard/horarios", label: "Horários", icon: CalendarClock },
  { href: "/dashboard/clientes", label: "Clientes", icon: Users },
  { href: "/dashboard/servicos", label: "Serviços", icon: Scissors },
  { href: "/dashboard/equipe", label: "Equipe", icon: UsersRound },
];

const managementNav: NavItem[] = [
  {
    href: "/dashboard/financeiro",
    label: "Financeiro",
    icon: Wallet,
    ownerOnly: true,
  },
  {
    href: "/dashboard/plano",
    label: "Plano e assinatura",
    icon: CreditCard,
    ownerOnly: true,
  },
  {
    href: "/dashboard/configuracoes",
    label: "Configurações",
    icon: Settings,
    ownerOnly: true,
  },
];

function isActive(pathname: string, item: NavItem) {
  if (item.exact) {
    return pathname === item.href;
  }

  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function DashboardShell({
  children,
  userName,
  userEmail,
  memberships,
  activeBarbershopId,
  role,
  isPlatformAdmin,
}: {
  children: React.ReactNode;
  userName: string;
  userEmail: string;
  memberships: MembershipSummary[];
  activeBarbershopId: string;
  role: AppRole;
  isPlatformAdmin: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isChangingShop, startShopChange] = useTransition();
  const [isSigningOut, startSignOut] = useTransition();

  const canManage = role === "owner" || isPlatformAdmin;

  const visibleNav = (items: NavItem[]) =>
    items.filter((item) => !item.ownerOnly || canManage);

  const allNav = [...visibleNav(operationNav), ...visibleNav(managementNav)];
  const current =
    allNav.find((item) => isActive(pathname, item)) ?? allNav[0];

  const activeMembership =
    memberships.find((item) => item.id === activeBarbershopId) ?? memberships[0];

  const changeShop = (barbershopId: string) => {
    if (barbershopId === activeBarbershopId) {
      return;
    }

    startShopChange(async () => {
      await setActiveBarbershopAction(barbershopId);
    });
  };

  const signOut = () => {
    startSignOut(async () => {
      await signOutAction();
    });
  };

  const sidebar = (mobile: boolean) => (
    <div className="flex h-full flex-col bg-sidebar">
      <div className="flex h-[4.5rem] items-center px-5 pr-12">
        <Link
          href="/dashboard"
          aria-label="LPS Agenda — painel"
          onClick={() => mobile && setMobileOpen(false)}
        >
          <Logo />
        </Link>
      </div>

      <div className="px-3 pb-4">
        {activeMembership ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex w-full items-center gap-2.5 rounded-xl border border-sidebar-border bg-card/70 px-2.5 py-2.5 text-left transition-colors hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-sidebar-ring/50"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary font-display text-[11px] font-semibold text-primary-foreground">
                  {initialsFromName(activeMembership.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium text-sidebar-foreground">
                    {activeMembership.name}
                  </span>
                  <span className="block text-[10px] text-muted-foreground">
                    {roleLabels[activeMembership.role]}
                  </span>
                </span>
                <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              <DropdownMenuLabel>Sua barbearia</DropdownMenuLabel>
              {memberships.map((membership) => (
                <DropdownMenuItem
                  key={membership.id}
                  onSelect={() => changeShop(membership.id)}
                  disabled={isChangingShop}
                  className="gap-2 py-2"
                >
                  <span className="grid size-7 place-items-center rounded-md bg-muted font-display text-[10px]">
                    {initialsFromName(membership.name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium">
                      {membership.name}
                    </span>
                    <span className="block text-[10px] text-muted-foreground">
                      {roleLabels[membership.role]}
                    </span>
                  </span>
                  {membership.id === activeMembership.id ? (
                    <Check className="size-3.5 text-gold" />
                  ) : null}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => router.push("/dashboard/configuracoes")}
                disabled={!canManage}
                className="gap-2 text-xs"
              >
                <Settings className="size-3.5" />
                Dados da barbearia
              </DropdownMenuItem>
              <DropdownMenuItem asChild className="gap-2 text-xs">
                <Link
                  href={`/agendar/${activeMembership.slug}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink className="size-3.5" />
                  Página pública
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>

      <nav
        className="flex-1 space-y-5 overflow-y-auto px-3 pb-4"
        aria-label="Navegação do painel"
      >
        <NavGroup
          label="Operação"
          items={visibleNav(operationNav)}
          pathname={pathname}
          onNavigate={mobile ? () => setMobileOpen(false) : undefined}
        />
        <NavGroup
          label="Gestão"
          items={visibleNav(managementNav)}
          pathname={pathname}
          onNavigate={mobile ? () => setMobileOpen(false) : undefined}
        />
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <div className="rounded-xl border border-gold/20 bg-gold-soft/35 p-3">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-foreground">
            <Sparkles className="size-3 text-gold" />
            Plano e pagamentos
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
            Acompanhe a assinatura da plataforma e regularize pagamentos
            pendentes.
          </p>
          {canManage ? (
            <Link
              href="/dashboard/plano"
              onClick={() => mobile && setMobileOpen(false)}
              className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-foreground underline decoration-gold/50 underline-offset-4 hover:text-gold"
            >
              Ver plano e pagamentos
            </Link>
          ) : null}
        </div>

        {isPlatformAdmin ? (
          <div className="mt-2 flex items-center gap-1.5 rounded-lg border border-border/70 px-2.5 py-2 text-[10px] text-muted-foreground">
            <ShieldCheck className="size-3 text-gold" />
            Administrador da plataforma
          </div>
        ) : null}
      </div>
    </div>
  );

  return (
    <div className="min-h-svh bg-background lg:grid lg:grid-cols-[17.5rem_1fr]">
      <aside className="sticky top-0 hidden h-svh border-r border-sidebar-border lg:block">
        {sidebar(false)}
      </aside>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <div className="flex min-h-svh flex-col">
          <header className="sticky top-0 z-30 flex h-[4.5rem] items-center gap-3 border-b border-border/70 bg-background/85 px-4 backdrop-blur-xl sm:px-6">
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden"
                aria-label="Abrir menu do painel"
              >
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>

            <div className="min-w-0">
              <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Painel
              </p>
              <h1 className="truncate font-display text-lg leading-tight tracking-tight">
                {current?.label ?? "Painel"}
              </h1>
            </div>

            <div className="ml-auto flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled
                className="hidden h-8 gap-2 rounded-lg border-dashed text-[11px] text-muted-foreground xl:inline-flex"
                title="Busca global em construção"
              >
                <Search className="size-3.5" />
                Buscar (em breve)
                <kbd className="ml-2 rounded border bg-muted px-1 font-mono text-[9px]">
                  /
                </kbd>
              </Button>

              <ThemeToggle />

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="relative"
                    aria-label="Notificações"
                  >
                    <Bell className="size-4" />
                    <span className="absolute right-2 top-2 size-1.5 rounded-full bg-gold" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-72">
                  <DropdownMenuLabel>Notificações</DropdownMenuLabel>
                  <div className="px-2 py-5 text-center">
                    <Bell className="mx-auto size-5 text-muted-foreground/60" />
                    <p className="mt-2 text-xs font-medium">
                      Nenhuma notificação por aqui
                    </p>
                    <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
                      A central de notificações será conectada na próxima etapa.
                    </p>
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="ml-1 rounded-full p-0.5 transition-shadow focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                    aria-label="Abrir menu da conta"
                  >
                    <Avatar size="sm">
                      <AvatarFallback className="bg-primary text-[10px] font-semibold text-primary-foreground">
                        {initialsFromName(userName)}
                      </AvatarFallback>
                    </Avatar>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60">
                  <div className="px-2 py-2">
                    <p className="truncate text-xs font-medium">{userName}</p>
                    <p className="truncate text-[10px] text-muted-foreground">
                      {userEmail}
                    </p>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => router.push("/dashboard/configuracoes")}
                    disabled={!canManage}
                    className="gap-2"
                  >
                    <Settings className="size-3.5" />
                    Configurações
                  </DropdownMenuItem>
                  {activeMembership ? (
                    <DropdownMenuItem asChild className="gap-2">
                      <Link
                        href={`/agendar/${activeMembership.slug}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <ExternalLink className="size-3.5" />
                        Abrir página pública
                      </Link>
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={signOut}
                    disabled={isSigningOut}
                    className="gap-2"
                  >
                    <LogOut className="size-3.5" />
                    {isSigningOut ? "Saindo..." : "Sair da conta"}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>

          <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            <div className="mx-auto w-full max-w-[86rem]">{children}</div>
          </main>
        </div>

        <SheetContent side="left" className="w-[86%] gap-0 p-0 sm:max-w-xs">
          <SheetHeader className="sr-only">
            <SheetTitle>Menu do painel</SheetTitle>
          </SheetHeader>
          {sidebar(true)}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function NavGroup({
  label,
  items,
  pathname,
  onNavigate,
}: {
  label: string;
  items: NavItem[];
  pathname: string;
  onNavigate?: () => void;
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div>
      <p className="px-2.5 pb-1.5 text-[9px] font-semibold uppercase tracking-[0.2em] text-muted-foreground/70">
        {label}
      </p>
      <div className="space-y-0.5">
        {items.map((item) => {
          const active = isActive(pathname, item);

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
              )}
            >
              <item.icon
                className={cn(
                  "size-4 shrink-0",
                  active ? "text-gold" : "text-muted-foreground/80",
                )}
              />
              <span className="flex-1">{item.label}</span>
              {active ? (
                <span className="size-1 rounded-full bg-gold" aria-hidden />
              ) : null}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
