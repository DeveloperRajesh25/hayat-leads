"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export interface LoginState {
  error?: string;
}

/**
 * Server Action for admin email/password sign-in.
 * On success it redirects to the requested page (or the dashboard).
 */
export async function login(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const redirectTo = String(formData.get("redirect") ?? "/dashboard");

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: error.message || "Invalid email or password." };
  }

  // Only allow internal redirects.
  const safeRedirect = redirectTo.startsWith("/") ? redirectTo : "/dashboard";
  redirect(safeRedirect);
}

/** Sign the admin out and return to the login page. */
export async function logout(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
