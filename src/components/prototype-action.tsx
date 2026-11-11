"use client";

import { ArrowRight, FlaskConical } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type PrototypeActionProps = {
  triggerLabel: string;
  title: string;
  description: string;
  steps?: { title: string; description: string }[];
  footnote?: string;
  triggerVariant?: React.ComponentProps<typeof Button>["variant"];
  triggerSize?: React.ComponentProps<typeof Button>["size"];
  triggerClassName?: string;
};

/**
 * Ação de interface que representa um recurso ainda não implementado.
 * Abre um modal explicativo — nunca simula uma integração ou gravação real.
 */
export function PrototypeAction({
  triggerLabel,
  title,
  description,
  steps = [],
  footnote,
  triggerVariant = "outline",
  triggerSize = "default",
  triggerClassName,
}: PrototypeActionProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant={triggerVariant}
          size={triggerSize}
          className={triggerClassName}
        >
          <FlaskConical className="size-4" />
          {triggerLabel}
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <span className="mb-1 inline-flex w-fit items-center gap-1.5 rounded-full border border-gold/30 bg-gold-soft/40 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-foreground">
            <FlaskConical className="size-3 text-gold" />
            Protótipo de interface
          </span>
          <DialogTitle className="text-lg">{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {steps.length > 0 ? (
          <ol className="space-y-2.5 rounded-xl border border-border/80 bg-muted/25 p-4">
            {steps.map((step, index) => (
              <li key={step.title} className="flex gap-2.5">
                <span className="grid size-5 shrink-0 place-items-center rounded-full border border-gold/30 bg-gold-soft/50 text-[10px] font-semibold text-foreground">
                  {index + 1}
                </span>
                <div>
                  <p className="text-xs font-medium">{step.title}</p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                    {step.description}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        ) : null}

        {footnote ? (
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {footnote}
          </p>
        ) : null}

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" className="gap-1.5">
              Entendi
              <ArrowRight className="size-3.5" />
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
