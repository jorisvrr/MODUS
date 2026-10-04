import { readFileSync } from "node:fs";

/**
 * Refuses to run a MUTATING end-to-end test unless the environment is
 * unmistakably local development.
 *
 * This exists because `.env.local` was pointed at production — the
 * Supabase pooler plus `pk_live`/`sk_live` Clerk keys as duplicate
 * entries that overrode the development ones. Next prefers `.env.local`
 * over `.env`, so the dev server read and wrote the production database
 * while every test still looked local. Nothing in the suite would have
 * noticed; the first symptom was production Clerk rejecting localhost.
 *
 * Deliberately a TEST-ONLY guard. It is not imported by anything under
 * `src/`, so it cannot affect a real deployment, where a non-local
 * database and live keys are exactly what is wanted.
 */

export type EnvironmentCheck = { safe: boolean; reason?: string };

const LOCAL_HOSTS = ["localhost", "127.0.0.1", "::1", "0.0.0.0"];

/** Pure, so the rule itself is testable without touching the filesystem. */
export function checkLocalMutableEnvironment(env: {
  databaseUrl?: string;
  clerkPublishableKey?: string;
  clerkSecretKey?: string;
  baseUrl?: string;
}): EnvironmentCheck {
  const { databaseUrl, clerkPublishableKey, clerkSecretKey, baseUrl } = env;

  if (baseUrl) {
    let host: string;
    try {
      host = new URL(baseUrl).hostname;
    } catch {
      return { safe: false, reason: `base URL is not a URL: ${baseUrl}` };
    }
    if (!LOCAL_HOSTS.includes(host)) {
      return {
        safe: false,
        reason: `tests that write must target localhost, not ${host}`,
      };
    }
  }

  if (!databaseUrl) return { safe: false, reason: "no DATABASE_URL resolved" };
  let dbHost: string;
  try {
    dbHost = new URL(databaseUrl).hostname;
  } catch {
    return { safe: false, reason: "DATABASE_URL is not a URL" };
  }
  if (!LOCAL_HOSTS.includes(dbHost)) {
    // The host, never the credentials.
    return { safe: false, reason: `DATABASE_URL points at ${dbHost}, not a local database` };
  }

  if (clerkPublishableKey?.startsWith("pk_live") || clerkSecretKey?.startsWith("sk_live")) {
    return { safe: false, reason: "live Clerk keys are configured" };
  }

  return { safe: true };
}

/**
 * Resolves the environment the way Next does — `.env.local` wins over
 * `.env` — and includes real process variables, which beat both.
 */
export function resolveLocalEnvironment() {
  const values: Record<string, string> = {};
  for (const file of [".env", ".env.local"]) {
    try {
      for (const line of readFileSync(file, "utf8").split("\n")) {
        const match = line.match(/^([A-Z_0-9]+)=(.*)$/);
        // Later files overwrite earlier ones, matching Next's precedence.
        if (match) values[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
      }
    } catch {
      // A missing file is not an error; the check below reports what is
      // actually missing.
    }
  }
  return {
    databaseUrl: process.env.DATABASE_URL ?? values.DATABASE_URL,
    clerkPublishableKey:
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? values.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    clerkSecretKey: process.env.CLERK_SECRET_KEY ?? values.CLERK_SECRET_KEY,
    baseUrl: process.env.MODUS_E2E_BASE_URL,
  };
}

/** Call from a mutating spec. Throws with the reason, never the value. */
export function requireLocalMutableEnvironment() {
  const result = checkLocalMutableEnvironment(resolveLocalEnvironment());
  if (!result.safe) {
    throw new Error(
      `Refusing to run a writing test: ${result.reason}. ` +
        `These tests submit real rows, so they only run against the local development ` +
        `database and the development Clerk instance. Production values belong in ` +
        `.env.supabase.local and .env.production.local, which the production scripts load explicitly.`
    );
  }
}
