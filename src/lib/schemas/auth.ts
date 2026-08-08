import { z } from "zod";

/**
 * Auth payloads.
 *
 * Shared by the API routes and the forms so a rule cannot drift between the two.
 * The client validating first is a courtesy that saves a round trip; the server
 * validating is the actual enforcement.
 */

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 200;

export const emailSchema = z
  .string()
  .trim()
  .min(1, "Enter your email address.")
  .max(254, "That email address is too long.")
  .pipe(z.email("Enter a valid email address."))
  // Stored lowercase so Alice@x.com and alice@x.com cannot become two accounts.
  .transform((value) => value.toLowerCase());

export const signupSchema = z.object({
  email: emailSchema,
  password: z
    .string()
    .min(
      MIN_PASSWORD_LENGTH,
      `Use at least ${MIN_PASSWORD_LENGTH} characters.`,
    )
    .max(MAX_PASSWORD_LENGTH, "That password is too long."),
});

export const loginSchema = z.object({
  email: emailSchema,
  // No length rule on login. Applying the signup rule here would reveal that a
  // password failing it cannot belong to a real account.
  password: z.string().min(1, "Enter your password."),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
