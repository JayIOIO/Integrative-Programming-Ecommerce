import axios from "axios";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:5000/api",
});

export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError<{ error?: string; message?: string }>(error)) {
    return error.response?.data?.error ?? error.response?.data?.message ?? error.message;
  }

  return error instanceof Error ? error.message : fallback;
}

export function getApiFieldErrors(error: unknown): Record<string, string> {
  if (!axios.isAxiosError<{ fields?: Record<string, unknown> }>(error)) return {};

  const fields = error.response?.data?.fields;
  if (!fields) return {};

  return Object.fromEntries(
    Object.entries(fields).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
}
