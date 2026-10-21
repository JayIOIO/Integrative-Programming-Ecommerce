// This file sets up our axios instance so every API call goes to the same base URL.
// Instead of typing http://localhost:5000/api every time, we just write the path like /products.
import axios from "axios";

// Create a single axios instance used everywhere in the app.
// The base URL comes from the .env file (VITE_API_URL), or falls back to localhost during development.
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:5000/api",
});

// This function reads the error message from a failed API response.
// Axios wraps HTTP errors in a special AxiosError object, so we check for that first.
// If it's a regular JS error, we return its message. Otherwise we use the fallback string.
export function getApiErrorMessage(error: unknown, fallback: string): string {
  // Check if this is an axios error (i.e., the server responded with a non-2xx status)
  if (axios.isAxiosError<{ error?: string; message?: string }>(error)) {
    // Try to get the error message from the response body, then fall back to the axios message
    return error.response?.data?.error ?? error.response?.data?.message ?? error.message;
  }

  // If it's a plain JavaScript error, just use its message
  return error instanceof Error ? error.message : fallback;
}

// This function extracts per-field validation errors from an API response.
// Our server sends { fields: { email: "Already taken", password: "Too short" } } on 400 errors.
// We pull those out here so we can show the messages under the correct form inputs.
export function getApiFieldErrors(error: unknown): Record<string, string> {
  // If this isn't an axios error at all, there are no field errors to return
  if (!axios.isAxiosError<{ fields?: Record<string, unknown> }>(error)) return {};

  // Pull the fields object from the response body
  const fields = error.response?.data?.fields;

  // If the server didn't send a fields object, return empty
  if (!fields) return {};

  // Filter out any field values that aren't strings (just in case), then convert to a plain object
  return Object.fromEntries(
    Object.entries(fields).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
}
