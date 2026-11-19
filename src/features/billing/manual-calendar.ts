/**
 * Civil date within the explicitly selected competence (YYYY-MM).
 * Always use the contractual anchor, never a previous payment or due date.
 */
export function monthlyAnchorDate(competence: string, anchorDay: number): string {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(competence);
  if (!match || match[1] === "0000") {
    throw new RangeError("Competência mensal inválida.");
  }
  if (!Number.isInteger(anchorDay) || anchorDay < 1 || anchorDay > 31) {
    throw new RangeError("O dia-âncora deve estar entre 1 e 31.");
  }

  const lastDay = new Date(0);
  lastDay.setUTCFullYear(Number(match[1]), Number(match[2]), 0);
  const day = Math.min(anchorDay, lastDay.getUTCDate());
  return `${competence}-${String(day).padStart(2, "0")}`;
}
