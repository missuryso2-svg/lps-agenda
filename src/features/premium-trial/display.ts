const dayMs = 24 * 60 * 60 * 1000;

export type AutomaticTrial = {
  started_at: string;
  ends_at: string;
  observed_at: string;
  running: boolean;
  welcome_available: boolean;
};

export const expiredTrialMessage =
  "Seu período gratuito terminou. Escolha um plano para continuar utilizando o LPS Agenda.";

export function automaticTrialDisplay(trial: AutomaticTrial, timeZone: string, elapsedMs = 0) {
  const start = Date.parse(trial.started_at);
  const end = Date.parse(trial.ends_at);
  const remaining = end - Date.parse(trial.observed_at) - Math.max(0, elapsedMs);
  const formatter = new Intl.DateTimeFormat("pt-BR", { timeZone, dateStyle: "long" });
  const endsOn = formatter.format(end);

  if (!trial.running || remaining <= 0) {
    return { endsOn, expired: true, daysLeft: 0, progress: 100, message: expiredTrialMessage };
  }

  const daysLeft = Math.ceil(remaining / dayMs);
  const lastDay = daysLeft === 1 && formatter.format(end - remaining) === endsOn;
  const message = lastDay
    ? "Hoje é o último dia do seu período grátis."
    : daysLeft === 1
      ? "Você ainda tem 1 dia grátis."
      : "Você ainda tem " + daysLeft + " dias grátis.";
  const progress = Math.min(99, Math.max(0, Math.floor(100 * (1 - remaining / (end - start)))));
  return { endsOn, expired: false, daysLeft, progress, message };
}
