"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
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
}: Props) {
  const [review, setReview] = useState<Record<string, string | boolean> | null>(
    null,
  );
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [pending, setPending] = useState(false);
  const busy = useRef(false),
    key = useRef(""),
    heading = useRef<HTMLHeadingElement>(null);
  const storageKey = ["lps.finance", actor, kind, ...Object.values(ids)].join(
    "/",
  );
  useEffect(() => {
    if (review) heading.current?.focus();
  }, [review]);
  function prepare(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget),
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
      setOutcome({
        ok: false,
        message: "Revise " + (field?.label ?? "os dados informados") + ".",
      });
      return;
    }
    if (parsed.data.kind === "pix" && parsed.data.amount !== expectedCents) {
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
    <details className="fa-operation">
      <summary>{title}</summary>
      <div className="fa-inset">
        {note && <p>{note}</p>}
        <dl className="fa-facts">
          {Object.entries(context).map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <form onSubmit={prepare} hidden={!!review || !!outcome?.ok}>
          <div className="fa-fields">
            {fields.map((f) => (
              <label
                key={f.name}
                className={f.type === "checkbox" ? "fa-check" : undefined}
              >
                {f.type === "checkbox" ? (
                  <>
                    <input type="checkbox" name={f.name} required />
                    {f.label}
                  </>
                ) : (
                  <>
                    {f.label}
                    {f.type === "select" ? (
                      <select
                        name={f.name}
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
                        defaultValue={f.initial}
                        required={!f.optional}
                        maxLength={f.maxLength}
                      />
                    ) : (
                      <input
                        type={f.type ?? "text"}
                        name={f.name}
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
          <button className="fa-primary">Revisar dados</button>
        </form>
        {review && (
          <section aria-label="Revisão da operação">
            <h3 tabIndex={-1} ref={heading}>
              Conferir antes de confirmar
            </h3>
            <dl className="fa-facts">
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
            <button
              className="fa-primary"
              type="button"
              disabled={pending}
              onClick={confirm}
            >
              {pending ? "Registrando…" : "Confirmar operação"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setReview(null);
                setOutcome(null);
              }}
            >
              Voltar aos dados
            </button>
          </section>
        )}
        {outcome && (
          <p role={outcome.ok ? "status" : "alert"}>{outcome.message}</p>
        )}
        {outcome?.ok && kind !== "pix" && (
          <button onClick={() => setOutcome(null)}>Nova operação</button>
        )}
      </div>
    </details>
  );
}
