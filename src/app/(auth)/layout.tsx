import type { ReactNode } from "react";

import { AccountShell } from "@/features/auth/components/account-shell";

export const dynamic = "force-dynamic";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return <AccountShell>{children}</AccountShell>;
}
