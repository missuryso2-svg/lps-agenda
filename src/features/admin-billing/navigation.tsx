"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Store,
  ReceiptText,
  History,
  UsersRound,
  Activity,
} from "lucide-react";
import { adminPath } from "./validation";

const items = [
  { route: "", label: "Visão geral", Icon: LayoutDashboard },
  { route: "/barbearias", label: "Barbearias", Icon: Store },
  { route: "/mensalidades", label: "Mensalidades", Icon: ReceiptText },
  { route: "/historico", label: "Histórico", Icon: History },
  { route: "/saude", label: "Saúde financeira", Icon: Activity },
  { route: "/operadores", label: "Operadores", Icon: UsersRound },
];
export function FinanceNav({ manager }: { manager: boolean }) {
  const path = usePathname();
  return (
    <nav aria-label="Administração de assinaturas">
      {items
        .filter((i) => manager || i.route !== "/operadores")
        .map(({ route, label, Icon }) => {
          const href = adminPath + route;
          return (
            <Link
              prefetch={false}
              key={href}
              href={href}
              aria-current={
                path === href || (route && path.startsWith(href + "/"))
                  ? "page"
                  : undefined
              }
            >
              <Icon size={17} aria-hidden="true" />
              {label}
            </Link>
          );
        })}
    </nav>
  );
}
