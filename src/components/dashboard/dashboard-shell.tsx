"use client";

import {
  CalendarClock, CalendarDays, ChevronsUpDown, CreditCard, ExternalLink,
  LayoutDashboard, LogOut, Menu, Scissors, Settings, ShieldCheck, Users,
  UsersRound, Wallet,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useTransition, type ComponentType, type ReactNode } from "react";

import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/brand/theme-toggle";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";
import { signOutAction } from "@/features/auth/actions";
import { setActiveBarbershopAction } from "@/features/barbershop/actions";
import { BookingNotices, type BookingNotice } from "@/features/scheduling/components/booking-notices";
import { roleLabels, type AppRole } from "@/lib/auth/permissions";
import { initialsFromName } from "@/lib/format";

import "./dashboard-j2.css";

type MembershipSummary = {
  id: string;
  name: string;
  slug: string;
  role: AppRole;
  logoUrl: string | null;
};

type NavItem = {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
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
  { href: "/dashboard/financeiro", label: "Financeiro", icon: Wallet, ownerOnly: true },
  { href: "/dashboard/plano", label: "Plano e assinatura", icon: CreditCard, ownerOnly: true },
  { href: "/dashboard/configuracoes", label: "Configurações", icon: Settings, ownerOnly: true },
];

function isActive(pathname: string, item: NavItem) {
  return pathname === item.href || (!item.exact && pathname.startsWith(item.href + "/"));
}

function ShopIdentity({ shop }: { shop: MembershipSummary }) {
  return (
    <>
      <Avatar className="barbershop-logo-surface j2-shop-logo">
        {shop.logoUrl && <AvatarImage src={shop.logoUrl} alt="" className="object-contain p-0.5" />}
        <AvatarFallback>{initialsFromName(shop.name)}</AvatarFallback>
      </Avatar>
      <span className="j2-shop-label">
        <strong title={shop.name}>{shop.name}</strong>
        <small>{roleLabels[shop.role]}</small>
      </span>
    </>
  );
}

export function DashboardShell({
  notices,
  timeZone,
  children,
  userName,
  userEmail,
  memberships,
  activeBarbershopId,
  role,
  isPlatformAdmin,
}: {
  notices: BookingNotice[] | null;
  timeZone: string;
  children: ReactNode;
  userName: string;
  userEmail: string;
  memberships: MembershipSummary[];
  activeBarbershopId: string;
  role: AppRole;
  isPlatformAdmin: boolean;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [pointerOpen, setPointerOpen] = useState(false);
  const [isChangingShop, startShopChange] = useTransition();
  const [isSigningOut, startSignOut] = useTransition();

  const canManage = role === "owner" || isPlatformAdmin;
  const visibleManagement = managementNav.filter(item => !item.ownerOnly || canManage);
  const current = [...operationNav, ...visibleManagement].find(item => isActive(pathname, item));
  const currentLabel = current?.label ?? (pathname === "/dashboard/qr" ? "QR Code" : "Painel");
  const primaryPage = pathname === "/dashboard" || pathname === "/dashboard/agenda";
  const active = memberships.find(shop => shop.id === activeBarbershopId) ?? memberships[0];

  function changeShop(id: string) {
    if (id === activeBarbershopId) return;

    startShopChange(async () => {
      await setActiveBarbershopAction(id);
    });
    setMobileOpen(false);
  }

  const sidebar = (mobile: boolean) => (
    <div className="j2-sidebar">
      <Link
        className="j2-sidebar-brand"
        href="/dashboard"
        aria-label="LPS Agenda — painel"
        onClick={mobile ? () => setMobileOpen(false) : undefined}
      >
        <Logo tone="inverse" />
      </Link>

      {active && (
        <div className="j2-shop-picker">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="j2-shop-trigger" aria-label={"Barbearia ativa: " + active.name}>
                <ShopIdentity shop={active} />
                <ChevronsUpDown size={16} aria-hidden />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="j2-panel-menu w-64">
              <DropdownMenuLabel>Trocar de barbearia</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={active.id} onValueChange={changeShop}>
                {memberships.map(shop => (
                  <DropdownMenuRadioItem key={shop.id} value={shop.id} disabled={isChangingShop}>
                    <ShopIdentity shop={shop} />
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild disabled={!canManage}>
                <Link href="/dashboard/configuracoes" onClick={mobile ? () => setMobileOpen(false) : undefined}>
                  <Settings aria-hidden /> Dados da barbearia
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={"/agendar/" + active.slug} target="_blank" rel="noreferrer">
                  <ExternalLink aria-hidden /> Página pública
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <span className="sr-only" role="status">{isChangingShop ? "Trocando de barbearia..." : ""}</span>
        </div>
      )}

      <nav className="j2-sidebar-nav" aria-label="Navegação do painel">
        <NavGroup label="Operação" items={operationNav} pathname={pathname} onNavigate={mobile ? () => setMobileOpen(false) : undefined} />
        {visibleManagement.length > 0 && (
          <NavGroup label="Gestão" items={visibleManagement} pathname={pathname} onNavigate={mobile ? () => setMobileOpen(false) : undefined} />
        )}
      </nav>

      {isPlatformAdmin && (
        <p className="j2-sidebar-admin"><ShieldCheck size={16} aria-hidden /> Administrador da plataforma</p>
      )}
    </div>
  );

  return (
    <div className="j2-dashboard">
      <a href="#conteudo-painel" className="j2-dashboard-skip">Ir para o conteúdo</a>
      <aside className="j2-dashboard-rail">{sidebar(false)}</aside>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <div className="j2-dashboard-body">
          <header className="j2-dashboard-header">
            <div className="j2-dashboard-mobile">
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Abrir menu do painel"
                  onClick={event => setPointerOpen(event.detail > 0)}
                >
                  <Menu className="size-5" aria-hidden />
                </Button>
              </SheetTrigger>
              {active && <div className="j2-mobile-shop"><ShopIdentity shop={active} /></div>}
            </div>

            <div className="j2-dashboard-location">
              <span className="j2-location-prefix">Painel da barbearia</span>
              {primaryPage ? <span>{currentLabel}</span> : <h1>{currentLabel}</h1>}
            </div>
            {!primaryPage && <h1 className="j2-mobile-route-heading">{currentLabel}</h1>}

            <div className="j2-dashboard-header-actions">
              <ThemeToggle />
              <BookingNotices notices={notices} tz={timeZone} />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" className="j2-account-trigger" aria-label="Abrir menu da conta">
                    <Avatar size="sm"><AvatarFallback>{initialsFromName(userName)}</AvatarFallback></Avatar>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="j2-panel-menu w-60">
                  <DropdownMenuLabel className="j2-user-label"><strong>{userName}</strong><span>{userEmail}</span></DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild disabled={!canManage}>
                    <Link href="/dashboard/configuracoes"><Settings aria-hidden /> Configurações</Link>
                  </DropdownMenuItem>
                  {active && (
                    <DropdownMenuItem asChild>
                      <Link href={"/agendar/" + active.slug} target="_blank" rel="noreferrer">
                        <ExternalLink aria-hidden /> Abrir página pública
                      </Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={() => startSignOut(async () => { await signOutAction(); })}
                    disabled={isSigningOut}
                  >
                    <LogOut aria-hidden /> {isSigningOut ? "Saindo..." : "Sair da conta"}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>
          <nav className="j2-dashboard-tabs" aria-label="Acesso rápido">
            {operationNav.slice(0, 2).map(item => (
              <Link key={item.href} href={item.href} aria-current={isActive(pathname, item) ? "page" : undefined}>
                <item.icon aria-hidden /> {item.label}
              </Link>
            ))}
          </nav>
          <main id="conteudo-painel" tabIndex={-1} className="j2-dashboard-main">
            <div className="j2-dashboard-container">{children}</div>
          </main>
        </div>

        <SheetContent
          side="left"
          className="j2-dashboard-sheet"
          overlayClassName="j2-dashboard-overlay"
          data-pointer-open={pointerOpen ? "" : undefined}
          onEscapeKeyDown={() => setPointerOpen(false)}
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Menu do painel</SheetTitle>
            <SheetDescription>Navegação e troca de barbearia ativa</SheetDescription>
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
  return (
    <div className="j2-nav-group">
      <p>{label}</p>
      <ul>
        {items.map(item => (
          <li key={item.href}>
            <Link href={item.href} onClick={onNavigate} aria-current={isActive(pathname, item) ? "page" : undefined}>
              <item.icon aria-hidden />
              <span>{item.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
