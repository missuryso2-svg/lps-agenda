"use client";

import "@/lib/validation/browser-safe-zod";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { createPublicBookingAction, getPublicAvailabilityAction } from "@/features/public-booking/actions";
import type { PublicBarber, PublicService } from "@/features/public-booking/types";
import type { AvailabilitySnapshot } from "@/features/scheduling/types";
import { fieldErrorsFrom } from "@/lib/actions";
import {
  addDaysToDateString, formatCurrencyFromCents, formatDateOnlyBR, formatPhoneBR,
  initialsFromName, shortWeekdayLabel, weekdayFromDateString, weekdayLabel,
} from "@/lib/format";
import { normalizePhoneDigits } from "@/lib/validation/customers";
import { publicBookingSchema } from "@/lib/validation/public-booking";

type Step = 1 | 2 | 3 | 4;
const steps = ["Serviço", "Profissional", "Data e hora", "Seus dados"] as const;
const titles = ["Escolha o serviço", "Escolha o profissional", "Escolha a data e o horário", "Revise e confirme"] as const;
const partsOfDay = [
  { label: "Manhã", start: 0, end: 12 },
  { label: "Tarde", start: 12, end: 18 },
  { label: "Noite", start: 18, end: 24 },
];

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? <p className="j2-book-error" id={id}>{message}</p> : null;
}

export function BookingWizard({
  slug, shopName, timezone, services, barbers, minDate, maxDate, openWeekdays,
}: {
  slug: string;
  shopName: string;
  timezone: string;
  services: PublicService[];
  barbers: PublicBarber[];
  minDate: string;
  maxDate: string;
  openWeekdays: number[];
}) {
  const router = useRouter();
  const heading = useRef<HTMLHeadingElement>(null);
  const priorStep = useRef<Step>(1);
  const submitting = useRef(false);
  const confirmedOnServer = useRef(false);
  const [step, setStep] = useState<Step>(1);
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [barberId, setBarberId] = useState<string | null>(null);
  const [date, setDate] = useState(minDate);
  const [time, setTime] = useState<string | null>(null);
  const [rejectedTime, setRejectedTime] = useState<string | null>(null);
  const [availability, setAvailability] = useState<AvailabilitySnapshot | null>(null);
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [reloadSlots, setReloadSlots] = useState(0);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[] | undefined>>({});
  const [isPending, startTransition] = useTransition();
  const [confirmed, setConfirmed] = useState(false);

  const service = services.find(item => item.id === serviceId);
  const barber = barbers.find(item => item.id === barberId);
  const eligible = barbers.filter(item => serviceId && item.serviceIds.includes(serviceId));
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= minDate && date <= maxDate;
  const validTime = availability?.slots.some(slot => slot.time === time) ?? false;
  const weekStart = step === 3 && validDate && date > addDaysToDateString(minDate, 6) ? date : minDate;
  const days = step === 3
    ? Array.from({ length: 7 }, (_, index) => addDaysToDateString(weekStart, index)).filter(day => day <= maxDate)
    : [];

  useEffect(() => {
    if (priorStep.current === step) return;
    priorStep.current = step;
    heading.current?.focus();
  }, [step]);

  useEffect(() => {
    if (step !== 3 || !serviceId || !barberId || !validDate) return;
    let active = true;

    void getPublicAvailabilityAction({ slug, serviceId, barberId, date }).then(result => {
      if (!active) return;
      setLoadingSlots(false);
      if (result.status === "error") {
        setAvailabilityError(result.message);
        return;
      }
      setAvailability(result.availability);
      setTime(current => result.availability.slots.some(slot => slot.time === current) ? current : null);
    }).catch(() => {
      if (!active) return;
      setLoadingSlots(false);
      setAvailabilityError("Não foi possível consultar os horários. Tente novamente.");
    });
    return () => { active = false; };
  }, [step, slug, serviceId, barberId, date, validDate, reloadSlots]);

  function clearMessages() {
    setFormError(null);
    setFieldErrors({});
  }

  function loadSlots(valid = validDate) {
    setAvailability(null);
    setAvailabilityError(null);
    setLoadingSlots(valid);
  }

  function goTo(next: Step) {
    clearMessages();
    if (next === 3) loadSlots();
    setStep(next);
  }

  function chooseService(id: string) {
    if (id !== serviceId) {
      setServiceId(id);
      setBarberId(null);
      setTime(null);
      setRejectedTime(null);
      setAvailability(null);
    }
    goTo(2);
  }

  function chooseBarber(id: string) {
    if (id !== barberId) {
      setBarberId(id);
      setTime(null);
      setRejectedTime(null);
    }
    goTo(3);
  }

  function chooseDate(value: string) {
    if (value === date) return;
    clearMessages();
    setDate(value);
    setTime(null);
    setRejectedTime(null);
    loadSlots(value >= minDate && value <= maxDate);
  }

  function focusFirstContactError(errors: Record<string, string[] | undefined>) {
    const first = errors.fullName ? "booking-name"
      : errors.phone ? "booking-phone"
      : errors.email ? "booking-email" : null;
    if (first) document.getElementById(first)?.focus();
  }

  function submit() {
    if (submitting.current) return;
    const parsed = publicBookingSchema.safeParse({
      slug, serviceId: serviceId ?? "", barberId: barberId ?? "",
      date, time: time ?? "", fullName, phone, email,
    });
    if (!parsed.success) {
      const errors = fieldErrorsFrom(parsed.error);
      setFieldErrors(errors);
      setFormError("Revise os campos indicados para continuar.");
      focusFirstContactError(errors);
      return;
    }

    submitting.current = true;
    clearMessages();
    startTransition(async () => {
      try {
        const result = await createPublicBookingAction(parsed.data);
        if (result.status === "success") {
          confirmedOnServer.current = true;
          setConfirmed(true);
          router.push("/agendar/" + result.slug + "/reserva/" + result.token + "?novo=1");
          return;
        }

        setFormError(result.message);
        const errors = result.fieldErrors ?? {};
        setFieldErrors(errors);
        if (errors.time || errors.date) {
          setRejectedTime(errors.time ? time : null);
          setTime(null);
          loadSlots();
          setReloadSlots(value => value + 1);
          setStep(3);
        } else if (errors.barberId || errors.serviceId) {
          setStep(errors.serviceId ? 1 : 2);
        } else {
          focusFirstContactError(errors);
        }
      } catch {
        setFormError("Não foi possível confirmar o envio. Confira com a barbearia se o horário ficou reservado.");
      } finally {
        // Keep submission blocked once the server has confirmed and navigation starts.
        if (!confirmedOnServer.current) submitting.current = false;
      }
    });
  }

  const busy = isPending || confirmed;

  return (
    <div className="j2-book-panel j2-book-wizard">
      <p className="j2-book-eyebrow">Agendamento online</p>
      <ol className="j2-book-steps" aria-label="Etapas do agendamento">
        {steps.map((label, index) => (
          <li key={label} aria-current={step === index + 1 ? "step" : undefined} data-complete={step > index + 1 || undefined}>
            <span aria-hidden>{step > index + 1 ? <Check size={13} /> : index + 1}</span>{label}
          </li>
        ))}
      </ol>

      {step > 1 && (
        <button className="j2-book-back" type="button" disabled={busy} onClick={() => goTo((step - 1) as Step)}>
          <ArrowLeft size={16} aria-hidden />{step === 2 ? "Trocar serviço" : step === 3 ? "Trocar profissional" : "Trocar horário"}
        </button>
      )}
      <h2 ref={heading} tabIndex={-1} className="j2-book-step-title">{titles[step - 1]}</h2>
      {formError && <p role="alert" className="j2-book-message j2-book-error">{formError}</p>}

      {step === 1 && (
        <div>
          <p className="j2-book-meta">Reserve sem criar conta. Seu link privado será exibido após a confirmação.</p>
          {services.length ? (
            <ul className="j2-book-choices">
              {services.map(item => (
                <li key={item.id}>
                  <button type="button" aria-pressed={serviceId === item.id} onClick={() => chooseService(item.id)}>
                    <span className="j2-book-choice-text">
                      <strong>{item.name}</strong>
                      {item.description && <span>{item.description}</span>}
                    </span>
                    <span className="j2-book-choice-value"><strong>{formatCurrencyFromCents(item.priceCents)}</strong><span>{item.durationMinutes} min</span></span>
                    {serviceId === item.id ? <Check size={16} aria-hidden /> : <ArrowRight size={16} aria-hidden />}
                  </button>
                </li>
              ))}
            </ul>
          ) : <p className="j2-book-message">Nenhum serviço pode ser agendado online no momento.</p>}
        </div>
      )}

      {step === 2 && (
        <div>
          <p className="j2-book-meta">Equipe habilitada para <strong>{service?.name}</strong>.</p>
          {eligible.length ? (
            <ul className="j2-book-choices">
              {eligible.map(item => (
                <li key={item.id}>
                  <button type="button" aria-pressed={barberId === item.id} onClick={() => chooseBarber(item.id)}>
                    <span className="j2-book-avatar" aria-hidden>
                      <span>{initialsFromName(item.name)}</span>
                      {item.avatarUrl && (
                        // The URL is projected server-side with private paths filtered.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.avatarUrl} alt="" width={48} height={48} loading="lazy" referrerPolicy="no-referrer"
                          onError={event => { event.currentTarget.hidden = true; }} />
                      )}
                    </span>
                    <span className="j2-book-choice-text">
                      <strong>{item.name}</strong>
                      {item.bio && <span>{item.bio}</span>}
                      <span>{services.filter(candidate => item.serviceIds.includes(candidate.id)).map(candidate => candidate.name).join(" · ")}</span>
                    </span>
                    {barberId === item.id ? <Check size={16} aria-hidden /> : <ArrowRight size={16} aria-hidden />}
                  </button>
                </li>
              ))}
            </ul>
          ) : <p className="j2-book-message">Nenhum profissional disponível para este serviço.</p>}
        </div>
      )}

      {step === 3 && (
        <>
          <p className="j2-book-meta">{service?.name} · {barber?.name}</p>
          <div className="j2-book-days" role="group" aria-label="Datas próximas">
            {days.map(day => {
              const weekday = weekdayFromDateString(day);
              const closed = !openWeekdays.includes(weekday);
              return (
                <button key={day} type="button" aria-pressed={day === date}
                  aria-label={weekdayLabel(weekday) + " " + formatDateOnlyBR(day) + (closed ? ", fechado" : "")}
                  onClick={() => chooseDate(day)}>
                  <span>{shortWeekdayLabel(weekday)}</span>
                  <strong>{Number(day.slice(-2))}</strong>
                  {closed && <small>Fechado</small>}
                </button>
              );
            })}
          </div>
          <label className="j2-book-date" htmlFor="booking-date">
            <span>Data</span>
            <input id="booking-date" type="date" value={date} min={minDate} max={maxDate} onChange={event => chooseDate(event.target.value)} />
          </label>
          <p className="j2-book-meta">Horários no fuso {timezone.replaceAll("_", " ")}.</p>

          <div className="j2-book-availability" aria-busy={loadingSlots} aria-live="polite">
            {loadingSlots && (
              <div className="j2-book-loading">
                <p>Consultando horários livres…</p>
                <div className="j2-book-slots" aria-hidden>{Array.from({ length: 6 }, (_, index) => <span key={index} />)}</div>
              </div>
            )}
            {!validDate && <p className="j2-book-message">Escolha uma data dentro do período disponível.</p>}
            {availabilityError && (
              <div className="j2-book-message">
                <p>{availabilityError}</p>
                <button type="button" className="j2-book-back" onClick={() => { loadSlots(); setReloadSlots(value => value + 1); }}>Consultar novamente</button>
              </div>
            )}
            {availability && (
              availability.slots.length === 0
                ? <p className="j2-book-message">{availability.reason ?? "Não há horários livres neste dia. Escolha outra data."}</p>
                : partsOfDay.map(part => {
                  const slots = availability.slots.filter(slot => {
                    const hour = Number(slot.time.slice(0, 2));
                    return hour >= part.start && hour < part.end;
                  });
                  return slots.length > 0 && (
                    <div key={part.label} role="group" aria-label={part.label} className="j2-book-slot-group">
                      <p>{part.label}</p>
                      <div className="j2-book-slots">
                        {slots.map(slot => (
                          <button key={slot.time} type="button" aria-pressed={time === slot.time} onClick={() => {
                            clearMessages();
                            setTime(slot.time);
                          }}>
                            {slot.time}{time === slot.time && <Check size={14} aria-hidden />}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })
            )}
            {rejectedTime && availability && !availability.slots.some(slot => slot.time === rejectedTime) && (
              <p className="j2-book-meta">{rejectedTime} · Indisponível</p>
            )}
          </div>
          <button type="button" className="j2-book-primary" disabled={!validTime || loadingSlots} onClick={() => goTo(4)}>
            Continuar{time && <span aria-hidden>{time}</span>} <ArrowRight size={16} aria-hidden />
          </button>
        </>
      )}

      {step === 4 && (
        <>
          <section className="j2-book-summary" aria-label="Resumo do agendamento">
            <h3>{shopName}</h3>
            <dl>
              <div><dt>Serviço</dt><dd>{service?.name}</dd></div>
              <div><dt>Profissional</dt><dd>{barber?.name}</dd></div>
              <div><dt>Data e horário</dt><dd>{formatDateOnlyBR(date)} às {time}</dd></div>
              <div><dt>Duração</dt><dd>{availability?.durationMinutes ?? service?.durationMinutes} min</dd></div>
              <div><dt>Valor</dt><dd>{formatCurrencyFromCents(availability?.priceCents ?? service?.priceCents ?? 0)}</dd></div>
            </dl>
          </section>

          <form method="post" noValidate onSubmit={event => { event.preventDefault(); submit(); }}>
            <fieldset disabled={busy} className="j2-book-fields">
              <legend>Seus dados para a reserva</legend>
              <div>
                <label htmlFor="booking-name">Nome completo</label>
                <input id="booking-name" value={fullName} autoComplete="name" required aria-invalid={Boolean(fieldErrors.fullName)}
                  aria-describedby={fieldErrors.fullName ? "booking-name-error" : undefined} onChange={event => setFullName(event.target.value)} />
                <FieldError id="booking-name-error" message={fieldErrors.fullName?.[0]} />
              </div>
              <div>
                <label htmlFor="booking-phone">Telefone com DDD</label>
                <input id="booking-phone" type="tel" inputMode="tel" autoComplete="tel" required value={phone} placeholder="(11) 98765-4321"
                  aria-invalid={Boolean(fieldErrors.phone)} aria-describedby={fieldErrors.phone ? "booking-phone-error" : undefined}
                  onChange={event => setPhone(event.target.value)} onBlur={() => {
                    const digits = normalizePhoneDigits(phone);
                    if (digits.length === 10 || digits.length === 11) setPhone(formatPhoneBR(digits));
                  }} />
                <FieldError id="booking-phone-error" message={fieldErrors.phone?.[0]} />
              </div>
              <div>
                <label htmlFor="booking-email">E-mail <span>(opcional)</span></label>
                <input id="booking-email" type="email" autoComplete="email" value={email} aria-invalid={Boolean(fieldErrors.email)}
                  aria-describedby={fieldErrors.email ? "booking-email-error" : undefined} onChange={event => setEmail(event.target.value)} />
                <FieldError id="booking-email-error" message={fieldErrors.email?.[0]} />
              </div>
            </fieldset>
            <p className="j2-book-meta">Seus dados são usados para esta reserva.</p>
            <button className="j2-book-primary" type="submit" disabled={busy}>
              {busy ? "Confirmando reserva…" : "Confirmar reserva"}
            </button>
          </form>
        </>
      )}
    </div>
  );
}
