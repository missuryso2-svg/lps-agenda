import { CircleAlert, CircleCheck } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";

export function FormError({ message }: { message?: string | null }) {
  if (!message) {
    return null;
  }

  return (
    <Alert
      variant="destructive"
      className="mb-5 border-destructive/25 bg-destructive/5 p-3.5"
    >
      <CircleAlert />
      <AlertDescription className="text-destructive">{message}</AlertDescription>
    </Alert>
  );
}

export function FormSuccess({ message }: { message?: string | null }) {
  if (!message) {
    return null;
  }

  return (
    <Alert className="mb-5 border-emerald-500/25 bg-emerald-500/5 p-3.5">
      <CircleCheck className="text-emerald-600 dark:text-emerald-400" />
      <AlertDescription className="text-foreground">{message}</AlertDescription>
    </Alert>
  );
}
