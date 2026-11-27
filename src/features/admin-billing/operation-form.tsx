"use client";

import "@/lib/validation/browser-safe-zod";
import { ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { submitFinancialOperation, type Outcome } from "./actions";
import { operation, type Kind } from "./validation";

export type Field = {
  name: string;
  label: string;
  type?:
    | "text"
    | "month"
    | "datetime-local"
    | "time"
    | "number"
    | "textarea"
    | "select"
    | "checkbox";
  options?: { value: string; label: string }[];
  initial?: string;
  optional?: boolean;
  min?: number;
  max?: number;
  maxLength?: number;
  placeholder?: string;
};
type Props = {
  kind: Kind;
  actor: string;
  title: string;
  context: Record<string, string>;
  ids: Record<string, string>;
  fields: Field[];
  note?: string;
  expectedCents?: number;
  featured?: boolean;
  sectionId?: string;
  openInitially?: boolean;
};
export function OperationForm({
  kind,
  actor,
  title,
  context,
  ids,
  fields,
  note,
  expectedCents,
  featured = false,
  sectionId,
  openInitially = false,
}: Props) {
  const [review, setReview] = useState<Record<string, string | boolean> | null>(
    null,
  );
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [pending, setPending] = useState(false);
  const [invalidField, setInvalidField] = useState<string | null>(null);
  const busy = useRef(false),
    key = useRef(""),
    heading = useRef<HTMLHeadingElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const reviewButton = useRef<HTMLButtonElement>(null);
  const disclosure = useRef<HTMLElement>(null);
  const reviewId = useId();
  const revoking = ids.permission === "revoke";
  const destructive = revoking || review?.command === "cancel" || review?.command === "suspend";
  const storageKey = ["lps.finance", actor, kind, ...Object.values(ids)].join(
    "/",
  );
  useEffect(() => {
    if (review && dialog.current) {
      dialog.current.showModal();
      heading.current?.focus();
    }
  }, [review]);
  function returnToForm() {
    if (busy.current) return;
    setReview(null);
    setOutcome(null);
    requestAnimationFrame(() => reviewButton.current?.focus());
  }
  function prepare(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const submitted = e.currentTarget;
    setInvalidField(null);
    const form = new FormData(submitted),
      values: Record<string, string | boolean> = {};
    for (const f of fields)
      values[f.name] =
        f.type === "checkbox"
          ? form.has(f.name)
          : String(form.get(f.name) ?? "");
    try {
      key.current =
        sessionStorage.getItem(storageKey) ||
        key.current ||
        crypto.randomUUID();
      sessionStorage.setItem(storageKey, key.current);
    } catch {
      key.current ||= crypto.randomUUID();
    }
    const parsed = operation.safeParse({
      ...ids,
      ...values,
      op: key.current,
      kind,
      confirmed: true,
    });
    if (!parsed.success) {
      const field = fields.find(
        (f) => f.name === parsed.error.issues[0]?.path[0],
      );
      setOutcome({ ok: false, message: "Revise " + (field?.label ?? "os dados informados") + "." });
      if (field) {
        setInvalidField(field.name);
        const control = submitted.elements.namedItem(field.name);
        if (control instanceof HTMLElement) control.focus();
      }
      return;
    }
    if (parsed.data.kind === "pix" && parsed.data.amount !== expectedCents) {
      setInvalidField("amount");
      const control = submitted.elements.namedItem("amount");
      if (control instanceof HTMLElement) control.focus();
      setOutcome({
        ok: false,
        message: "O valor recebido deve ser igual ao valor integral exigível.",
      });
      return;
    }
    setOutcome(null);
    setReview(values);
  }
  async function confirm() {
    if (!review || busy.current) return;
    busy.current = true;
    setPending(true);
    try {
      const result = await submitFinancialOperation({
        ...ids,
        ...review,
        kind,
        op: key.current,
        confirmed: true,
      });
      setOutcome(result);
      if (result.ok) {
        toast.success(result.message);
        try {
          sessionStorage.removeItem(storageKey);
        } catch {
          /* Receipt already committed. */
        }
        key.current = "";
        setReview(null);
        requestAnimationFrame(() => disclosure.current?.focus());
      }
    } catch {
      setOutcome({
        ok: false,
        message:
          "Resposta interrompida. Consulte o histórico ou repita com os mesmos dados.",
      });
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  return (
    <details
      id={sectionId}
      className="fa-operation"
      data-danger={revoking}
      data-featured={featured}
      open={openInitially || undefined}
    >
      <summary ref={disclosure}>{title}<ChevronDown size={17} aria-hidden /></summary>
      <div className="fa-inset">
        {note && <p className="fa-operation-note">{note}</p>}
        <dl className="fa-facts">
          {Object.entries(context).map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <form method="post" onSubmit={prepare} hidden={!!review || !!outcome?.ok}>
          <div className="fa-fields">
            {fields.map((f) => (
              <label
                key={f.name}
                className={f.type === "checkbox" ? "fa-check" : undefined}
              >
                {f.type === "checkbox" ? (
                  <>
                    <input type="checkbox" name={f.name} required aria-invalid={invalidField === f.name || undefined} aria-describedby={invalidField === f.name ? reviewId + "-feedback" : undefined} />
                    {f.label}
                  </>
                ) : (
                  <>
                    {f.label}
                    {f.type === "select" ? (
                      <select
                        name={f.name}
                        aria-invalid={invalidField === f.name || undefined}
                        aria-describedby={invalidField === f.name ? reviewId + "-feedback" : undefined}
                        required
                        defaultValue={f.initial ?? ""}
                      >
                        <option value="" disabled>
                          Selecione
                        </option>
                        {f.options?.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    ) : f.type === "textarea" ? (
                      <textarea
                        name={f.name}
                        aria-invalid={invalidField === f.name || undefined}
                        aria-describedby={invalidField === f.name ? reviewId + "-feedback" : undefined}
                        defaultValue={f.initial}
                        required={!f.optional}
                        maxLength={f.maxLength}
                      />
                    ) : (
                      <input
                        type={f.type ?? "text"}
                        name={f.name}
                        aria-invalid={invalidField === f.name || undefined}
                        aria-describedby={invalidField === f.name ? reviewId + "-feedback" : undefined}
                        defaultValue={f.initial}
                        required={!f.optional}
                        min={f.min}
                        max={f.max}
                        maxLength={f.maxLength}
                        placeholder={f.placeholder}
                        inputMode={f.name === "amount" ? "decimal" : undefined}
                      />
                    )}
                  </>
                )}
              </label>
            ))}
          </div>
          <button ref={reviewButton} className="fa-primary">
            Revisar dados
          </button>
        </form>
        {review && (
          <dialog
            ref={dialog}
            className="fa-review"
            aria-labelledby={reviewId}
            onCancel={(event) => {
              event.preventDefault();
              returnToForm();
            }}
          >
            <small>{title}</small>
            <h3 id={reviewId} tabIndex={-1} ref={heading}>
              Conferir antes de confirmar
            </h3>
            {note && <p className="fa-operation-note">{note}</p>}
            <dl className="fa-facts">
              {Object.entries(context).map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
              {fields.map((f) => (
                <div key={f.name}>
                  <dt>{f.label}</dt>
                  <dd>
                    {f.type === "checkbox"
                      ? "Sim"
                      : (f.options?.find((o) => o.value === review[f.name])
                          ?.label ??
                        (String(review[f.name]) || "—"))}
                  </dd>
                </div>
              ))}
            </dl>
            {outcome && !outcome.ok && <p className="fa-feedback" role="alert">{outcome.message}</p>}
            <div className="fa-review-actions">
              <button
                className={destructive ? "fa-danger" : "fa-primary"}
                type="button"
                disabled={pending}
                onClick={confirm}
              >
                {pending ? "Registrando…" : "Confirmar operação"}
              </button>
              <button type="button" disabled={pending} onClick={returnToForm}>
                Voltar aos dados
              </button>
            </div>
          </dialog>
        )}
        {!review && outcome && (
          <p id={reviewId + "-feedback"} className="fa-feedback" role={outcome.ok ? "status" : "alert"}>{outcome.message}</p>
        )}
        {outcome?.ok && kind !== "pix" && (
          <button type="button" onClick={() => setOutcome(null)}>Nova operação</button>
        )}
      </div>
    </details>
  );
}
