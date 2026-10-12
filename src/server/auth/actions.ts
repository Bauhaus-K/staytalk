"use server";

import { AuthError } from "next-auth";
import { z } from "zod";
import { signIn, signOut } from "@/auth";

export type LoginState =
  { error?: "invalidCredentials" | "genericError"; magicLinkSent?: boolean } | undefined;

const safeCallback = (value: FormDataEntryValue | null, fallback: string) => {
  const v = typeof value === "string" ? value : "";
  // Only allow same-origin relative paths.
  return v.startsWith("/") && !v.startsWith("//") ? v : fallback;
};

export async function loginWithPassword(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const locale = z.enum(["ko", "ja", "en"]).catch("ko").parse(formData.get("locale"));
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: safeCallback(formData.get("callbackUrl"), `/${locale}`),
    });
    return undefined;
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: error.type === "CredentialsSignin" ? "invalidCredentials" : "genericError" };
    }
    throw error; // NEXT_REDIRECT on success must propagate.
  }
}

export async function loginWithMagicLink(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const locale = z.enum(["ko", "ja", "en"]).catch("ko").parse(formData.get("locale"));
  const email = z.email().safeParse(formData.get("email"));
  if (!email.success) return { error: "genericError" };
  try {
    // redirect:false keeps the user on our login page. Unknown emails are
    // rejected by the signIn callback (no mail is sent), but we show the same
    // confirmation either way to avoid account enumeration.
    await signIn("nodemailer", {
      email: email.data.toLowerCase(),
      redirect: false,
      redirectTo: safeCallback(formData.get("callbackUrl"), `/${locale}`),
    });
    return { magicLinkSent: true };
  } catch (error) {
    if (error instanceof AuthError) {
      return error.type === "AccessDenied" ? { magicLinkSent: true } : { error: "genericError" };
    }
    throw error;
  }
}

export async function logout(formData: FormData) {
  const locale = z.enum(["ko", "ja", "en"]).catch("ko").parse(formData.get("locale"));
  await signOut({ redirectTo: `/${locale}/login` });
}
