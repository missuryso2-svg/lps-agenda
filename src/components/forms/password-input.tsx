"use client";

import { Eye, EyeOff } from "lucide-react";
import * as React from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function PasswordInput({
  className,
  toggleLabel = "Mostrar senha",
  ...props
}: React.ComponentProps<typeof Input> & { toggleLabel?: string }) {
  const [visible, setVisible] = React.useState(false);

  return (
    <div className="account-password">
      <Input {...props} type={visible ? "text" : "password"} className={cn("pr-12", className)} />
      <button
        type="button"
        className="account-password-toggle"
        aria-label={toggleLabel}
        aria-pressed={visible}
        aria-controls={props.id}
        disabled={props.disabled}
        onClick={() => setVisible(current => !current)}
      >
        {visible ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
      </button>
    </div>
  );
}
