// Both clients run server-side only: the browser talks to /api/on-duty, never
// to Supabase directly. That is why no variable here carries a NEXT_PUBLIC_
// prefix — nothing needs to be inlined into the browser bundle.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable: ${name}`);
  return v;
}

/** Read-only client (anon key). RLS limits it to select. */
export function supabaseAnon(): SupabaseClient {
  return createClient(required("SUPABASE_URL"), required("SUPABASE_ANON_KEY"), {
    auth: { persistSession: false },
  });
}

/** Service-role client — scrapers and cron only. Never import from client code. */
export function supabaseAdmin(): SupabaseClient {
  return createClient(required("SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
}
