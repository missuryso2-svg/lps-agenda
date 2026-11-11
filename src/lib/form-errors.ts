import type { FieldValues, Path, UseFormReturn } from "react-hook-form";

export function applyServerFieldErrors<T extends FieldValues>(
  form: UseFormReturn<T>,
  fieldErrors?: Record<string, string[] | undefined>,
) {
  if (!fieldErrors) {
    return;
  }

  for (const [field, messages] of Object.entries(fieldErrors)) {
    const message = messages?.[0];

    if (message) {
      form.setError(field as Path<T>, {
        type: "server",
        message,
      });
    }
  }
}
