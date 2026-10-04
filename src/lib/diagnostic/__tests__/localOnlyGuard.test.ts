import { describe, expect, it } from "vitest";
import { checkLocalMutableEnvironment } from "../../../../e2e/localOnlyGuard";

/**
 * The guard is the thing that would have caught `.env.local` being
 * pointed at production, so its rule is tested directly.
 */
const LOCAL = {
  databaseUrl: "postgresql://joris@localhost:5432/modus_dev?schema=public",
  clerkPublishableKey: "pk_test_abc",
  clerkSecretKey: "sk_test_abc",
};

describe("local-only guard for writing tests", () => {
  it("allows a genuinely local environment", () => {
    expect(checkLocalMutableEnvironment(LOCAL).safe).toBe(true);
  });

  it("refuses the exact misconfiguration that occurred", () => {
    const result = checkLocalMutableEnvironment({
      ...LOCAL,
      databaseUrl:
        "postgresql://postgres.qnoxrcjiynrbwmdekggh:secret@aws-0-eu-west-1.pooler.supabase.com:6543/postgres",
    });
    expect(result.safe).toBe(false);
    expect(result.reason).toContain("pooler.supabase.com");
    // The reason names the host so it is actionable, and must never
    // carry the credentials from the URL.
    expect(result.reason).not.toContain("secret");
    expect(result.reason).not.toContain("postgres.qnoxrcjiynrbwmdekggh");
  });

  it("refuses live Clerk keys even with a local database", () => {
    expect(checkLocalMutableEnvironment({ ...LOCAL, clerkPublishableKey: "pk_live_x" }).safe).toBe(false);
    expect(checkLocalMutableEnvironment({ ...LOCAL, clerkSecretKey: "sk_live_x" }).safe).toBe(false);
  });

  it("refuses a writing test aimed at a deployment", () => {
    const result = checkLocalMutableEnvironment({ ...LOCAL, baseUrl: "https://www.withmodus.co" });
    expect(result.safe).toBe(false);
    expect(result.reason).toContain("www.withmodus.co");
  });

  it("allows an explicitly local base URL", () => {
    expect(checkLocalMutableEnvironment({ ...LOCAL, baseUrl: "http://localhost:3000" }).safe).toBe(true);
  });

  it("refuses when no database is resolved at all", () => {
    expect(checkLocalMutableEnvironment({ ...LOCAL, databaseUrl: undefined }).safe).toBe(false);
  });
});
