import { z } from "zod";

export type ActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

export const initialActionState: ActionState = {
  status: "idle",
};

export function actionError(
  message: string,
  fieldErrors?: Record<string, string[] | undefined>,
): ActionState {
  return {
    status: "error",
    message,
    fieldErrors,
  };
}

export function actionSuccess(message: string): ActionState {
  return {
    status: "success",
    message,
  };
}

export function fieldErrorsFrom(error: z.ZodError): Record<string, string[] | undefined> {
  return z.flattenError(error).fieldErrors;
}
