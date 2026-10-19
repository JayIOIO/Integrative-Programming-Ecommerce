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

export const checkoutSchema = z.object({
  customerName: z
    .string()
    .trim()
    .min(2, "Enter a customer name with at least 2 characters.")
    .max(100, "Customer name must be 100 characters or fewer."),
  address: z
    .string()
    .trim()
    .min(8, "Enter a complete house or lot number and street address.")
    .max(200, "Street address must be 200 characters or fewer.")
    .regex(
      /^(?:\d+[A-Za-z]?(?:[-/]\d+[A-Za-z]?)?|(?:Unit|Room|Block|Blk|Lot|Building|Bldg|House|Door|Purok|Sitio)\s*#?\s*[\p{L}\d-]+)[\s,]+(?=.*\p{L})[\p{L}\p{M}\d\s.,#/'()-]+$/iu,
      "Include a house/lot number and a street, block, or sitio name.",
    ),
  city: z
    .string()
    .trim()
    .min(2, "Enter a city with at least 2 characters.")
    .max(100, "City must be 100 characters or fewer.")
    .regex(
      /^[\p{L}][\p{L}\p{M} .'-]*[\p{L}\p{M}]$/u,
      "Enter a valid Philippine city or municipality name.",
    ),
  province: z
    .string()
    .trim()
    .min(2, "Enter a state or province with at least 2 characters.")
    .max(100, "Province must be 100 characters or fewer.")
    .regex(
      /^[\p{L}][\p{L}\p{M} .'-]*[\p{L}\p{M}]$/u,
      "Enter a valid Philippine province or region name.",
    ),
  postalCode: z
    .string()
    .trim()
    .regex(/^\d{4}$/, "Enter a 4-digit Philippine ZIP code."),
  phone: z
    .string()
    .trim()
    .regex(
      /^\+?[0-9][0-9\s().-]*$/,
      "Enter a valid phone number using digits and standard phone punctuation.",
    )
    .refine(
      (value) => {
        const digitCount = value.replace(/\D/g, "").length;
        return digitCount >= 7 && digitCount <= 15;
      },
      "Phone number must contain 7 to 15 digits.",
    ),
  payment_method: z.enum(["Credit Card", "PayPal", "Cash on Delivery"], {
    error: "Choose a valid payment method.",
  }),
});
