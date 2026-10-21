// This file contains all the Zod validation schemas used in forms across the app.
// Zod lets us define rules for what valid data looks like, and React Hook Form enforces them.
import { z } from "zod";

// We use one function for both login and signup because they share the same fields.
// The only difference is signup also requires a name and stricter password rules.
// The isSignup flag controls which rules get applied at runtime.
export function createAuthSchema(isSignup: boolean) {
  return z.object({
    // Name is only required during signup — on login we just pass an empty string through
    name: isSignup
      ? z.string().trim().min(2, "Enter a name with at least 2 characters.").max(100)
      : z.string(), // login doesn't need a name, so no validation

    // Email must be a valid format for both login and signup
    email: z.string().trim().email("Enter a valid email address."),

    // Signup needs at least 6 characters; login just needs something non-empty
    password: isSignup
      ? z.string().min(6, "Password must be at least 6 characters.")
      : z.string().min(1, "Enter your password."),
  });
}

// Schema for the profile update form — only allows changing the display name
export const profileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Name must be between 2 and 100 characters.")
    .max(100, "Name must be between 2 and 100 characters."),
});

// Schema for the checkout form — validates all shipping and payment details
export const checkoutSchema = z.object({
  // Customer name must be at least 2 characters so we catch accidental single-letter entries
  customerName: z
    .string()
    .trim()
    .min(2, "Enter a customer name with at least 2 characters.")
    .max(100, "Customer name must be 100 characters or fewer."),

  // Street address must include a house/lot number followed by a street or block name.
  // The regex requires a number at the start OR a recognized prefix like "Unit", "Blk", "Lot", etc.
  address: z
    .string()
    .trim()
    .min(8, "Enter a complete house or lot number and street address.")
    .max(200, "Street address must be 200 characters or fewer.")
    .regex(
      /^(?:\d+[A-Za-z]?(?:[-/]\d+[A-Za-z]?)?|(?:Unit|Room|Block|Blk|Lot|Building|Bldg|House|Door|Purok|Sitio)\s*#?\s*[\p{L}\d-]+)[\s,]+(?=.*\p{L})[\p{L}\p{M}\d\s.,#/'()-]+$/iu,
      "Include a house/lot number and a street, block, or sitio name.",
    ),

  // City or municipality — must start and end with a letter, allows spaces and hyphens
  city: z
    .string()
    .trim()
    .min(2, "Enter a city with at least 2 characters.")
    .max(100, "City must be 100 characters or fewer.")
    .regex(
      /^[\p{L}][\p{L}\p{M} .'-]*[\p{L}\p{M}]$/u,
      "Enter a valid Philippine city or municipality name.",
    ),

  // Province or region — same rules as city
  province: z
    .string()
    .trim()
    .min(2, "Enter a state or province with at least 2 characters.")
    .max(100, "Province must be 100 characters or fewer.")
    .regex(
      /^[\p{L}][\p{L}\p{M} .'-]*[\p{L}\p{M}]$/u,
      "Enter a valid Philippine province or region name.",
    ),

  // Philippine ZIP codes are always exactly 4 digits
  postalCode: z
    .string()
    .trim()
    .regex(/^\d{4}$/, "Enter a 4-digit Philippine ZIP code."),

  // Phone number — accepts optional leading +, digits, spaces, dashes, and parentheses.
  // The refine step counts actual digits separately to enforce the 7–15 digit rule.
  phone: z
    .string()
    .trim()
    .regex(
      /^\+?[0-9][0-9\s().-]*$/,
      "Enter a valid phone number using digits and standard phone punctuation.",
    )
    .refine(
      (value) => {
        // Strip everything except digits and check the count
        const digitCount = value.replace(/\D/g, "").length;
        return digitCount >= 7 && digitCount <= 15;
      },
      "Phone number must contain 7 to 15 digits.",
    ),

  // Payment method must be one of the three options our backend supports
  payment_method: z.enum(["Credit Card", "PayPal", "Cash on Delivery"], {
    error: "Choose a valid payment method.",
  }),
});
