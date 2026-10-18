import { z } from "zod";

// Login and signup share the same form fields, but signup also validates the name.
export function createAuthSchema(isSignup: boolean) {
  return z.object({
    name: isSignup
      ? z.string().trim().min(2, "Enter a name with at least 2 characters.").max(100)
      : z.string(),
    email: z.string().trim().email("Enter a valid email address."),
    password: isSignup
      ? z.string().min(6, "Password must be at least 6 characters.")
      : z.string().min(1, "Enter your password."),
  });
}

export const profileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Name must be between 2 and 100 characters.")
    .max(100, "Name must be between 2 and 100 characters."),
});
