import { describe, expect, it } from "vitest";

import { safeNextPath } from "@/lib/navigation";
import {
  canManageShop,
  canOperateShop,
  canViewFinancials,
  isPlatformAdmin,
  roleLabels,
} from "@/lib/auth/permissions";

describe("permissões", () => {
  it("reconhece administrador somente em app_metadata", () => {
    expect(isPlatformAdmin({ lps_role: "platform_admin" })).toBe(true);
    expect(isPlatformAdmin({ lps_role: "owner" })).toBe(false);
    expect(isPlatformAdmin(null)).toBe(false);
    expect(isPlatformAdmin("platform_admin")).toBe(false);
  });

  it("diferencia owner e staff", () => {
    expect(canManageShop("owner")).toBe(true);
    expect(canManageShop("staff")).toBe(false);
    expect(canOperateShop("owner")).toBe(true);
    expect(canOperateShop("staff")).toBe(true);
    expect(canViewFinancials("owner")).toBe(true);
    expect(canViewFinancials("staff")).toBe(false);
    expect(canManageShop(null)).toBe(false);
  });

  it("mantém rótulos em português", () => {
    expect(roleLabels.owner).toBe("Proprietário");
    expect(roleLabels.staff).toBe("Equipe");
  });
});

describe("navegação segura", () => {
  it("aceita caminhos internos", () => {
    expect(safeNextPath("/dashboard/agenda")).toBe("/dashboard/agenda");
    expect(safeNextPath("/onboarding")).toBe("/onboarding");
  });

  it("descarta destinos externos e protocol-relative", () => {
    expect(safeNextPath("https://malicioso.example")).toBe("/dashboard");
    expect(safeNextPath("//malicioso.example")).toBe("/dashboard");
    expect(safeNextPath("\\\\malicioso.example")).toBe("/dashboard");
    expect(safeNextPath("javascript:alert(1)")).toBe("/dashboard");
  });

  it("descarta quebras de linha e backslashes", () => {
    expect(safeNextPath("/dashboard\nSet-Cookie: x")).toBe("/dashboard");
    expect(safeNextPath("/dashboard\\..\\admin")).toBe("/dashboard");
  });

  it("usa fallback quando o valor é vazio", () => {
    expect(safeNextPath(undefined)).toBe("/dashboard");
    expect(safeNextPath(null, "/login")).toBe("/login");
    expect(safeNextPath("   ", "/login")).toBe("/login");
  });
});
