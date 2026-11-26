import type { Metadata } from "next";

import { BookingAccessNotice } from "@/components/dashboard/booking-access-notice";
import { ConfigRequiredPage } from "@/components/config-required-page";
import { createClient } from "@/lib/supabase/server";
import { AutomaticTrialDashboard } from "@/features/premium-trial/dashboard";
import { getOwnerAutomaticTrial } from "@/features/premium-trial/queries";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { getBarbershopBookingAccess } from "@/features/scheduling/booking-access";
import type { BarbershopBookingAccess } from "@/features/scheduling/booking-access";
import { isCurrentUserPlatformAdmin, requireDashboardContext } from "@/lib/auth/dal";
import { getSupabasePublicEnv } from "@/lib/env/public";
import { publicBarbershopLogoUrl } from "@/features/barbershop/logo";

export const metadata: Metadata = {
  title: {
    default: "Painel",
    template: "%s · LPS Agenda",
  },
  description:
    "Painel de gestão da sua barbearia: agenda, clientes, serviços, equipe e financeiro.",
  robots: {
    index: false,
    follow: false,
  },
};

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!getSupabasePublicEnv()) {
    return (
      <ConfigRequiredPage
        title="Conecte o Supabase para abrir o painel"
        description="O painel consulta sessão, barbearias e dados operacionais no Supabase. Sem um projeto configurado, esta área permanece bloqueada com segurança."
      />
    );
  }

  const context = await requireDashboardContext();
  const { user, profile, memberships, active } = context;
  let bookingAccess: BarbershopBookingAccess | null = null;
  let bookingAccessCheckFailed = false;

  try {
    bookingAccess = await getBarbershopBookingAccess(active.barbershop_id);
  } catch {
    bookingAccessCheckFailed = true;
  }

  const db = await createClient();
  const canSeeAutomaticTrial = active.role === "owner" &&
    (bookingAccess?.reason === "trial" || bookingAccess?.reason === "trial_ended");
  const [notices, trial] = await Promise.all([
    db.rpc("booking_notices", { shop: active.barbershop_id }),
    canSeeAutomaticTrial ? getOwnerAutomaticTrial(active.barbershop_id).catch(() => null) : null,
  ]);
  const timeZone = active.barbershop.timezone || "America/Sao_Paulo";
  const displayName =
    profile?.full_name?.trim() ||
    (typeof user.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name.trim()
      : "") ||
    user.email?.split("@")[0] ||
    "Usuário";

  const membershipSummaries = memberships.map((membership) => ({
    id: membership.barbershop_id,
    name: membership.barbershop.name,
    slug: membership.barbershop.slug,
    role: membership.role,
    logoUrl: publicBarbershopLogoUrl(
      membership.barbershop_id,
      membership.barbershop.logo_url,
    ),
  }));

  return (
    <DashboardShell
      notices={notices.data}
      timeZone={timeZone}
      userName={displayName}
      userEmail={user.email ?? "E-mail não informado"}
      memberships={membershipSummaries}
      activeBarbershopId={active.barbershop_id}
      role={active.role}
      isPlatformAdmin={isCurrentUserPlatformAdmin(user)}
    >
      {trial && <AutomaticTrialDashboard
        key={active.barbershop_id + trial.observed_at}
        shop={active.barbershop_id}
        trial={trial}
        timeZone={timeZone}
      />}
      {(!trial || bookingAccess?.reason !== "trial_ended") && (
        <BookingAccessNotice
          access={bookingAccess}
          checkFailed={bookingAccessCheckFailed}
          canManageBilling={active.role === "owner"}
          timeZone={timeZone}
        />
      )}
      {children}
    </DashboardShell>
  );
}
