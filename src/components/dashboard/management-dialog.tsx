"use client";

import { useRef, type ComponentProps } from "react";

import { DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export function ManagementDialogContent({
  className, onOpenAutoFocus, onCloseAutoFocus, ...props
}: ComponentProps<typeof DialogContent>) {
  const trigger = useRef<HTMLElement | null>(null);

  return (
    <DialogContent
      {...props}
      className={cn("j2-agenda-dialog j2-management-dialog", className)}
      overlayClassName="j2-agenda-overlay"
      onOpenAutoFocus={event => {
        trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        onOpenAutoFocus?.(event);
      }}
      onCloseAutoFocus={event => {
        onCloseAutoFocus?.(event);
        if (event.defaultPrevented) return;
        event.preventDefault();
        requestAnimationFrame(() => {
          if (document.querySelector('.j2-management-dialog[data-state="open"]')) return;
          const element = trigger.current;
          if (element?.isConnected && element !== document.body && !element.closest("[role=dialog]")) {
            element.focus();
          } else {
            document.querySelector<HTMLElement>("main [data-management-focus]")?.focus();
          }
        });
      }}
    />
  );
}
