import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The homepage's entry context, and the three rules it exists to keep.
 *
 * It carries what a visitor typed and selected on the homepage into the
 * diagnostic. That makes it the visitor's own words sitting in a browser,
 * so: it is scoped to one identity, it never lands in the diagnostic's
 * draft key, and it never travels in a URL.
 */

const store = new Map<string, string>();

const sessionStorageStub = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};

vi.stubGlobal("window", { sessionStorage: sessionStorageStub });
vi.stubGlobal("sessionStorage", sessionStorageStub);

const KEY = "modus:entry-context:v1";
const DRAFT_KEY = "modus:diagnostic:v1";

const {
  ENTRY_TEXT_MAX,
  clearEntryContext,
  loadEntryContext,
  purgeForeignEntryContext,
  saveEntryContext,
} = await import("../entryContext");

beforeEach(() => store.clear());

describe("it belongs to exactly one identity", () => {
  it("is returned to the identity that saved it", () => {
    saveEntryContext(["Planning work"], "quotes take two days", "user_abc");
    expect(loadEntryContext("user_abc")).toMatchObject({
      topics: ["Planning work"],
      text: "quotes take two days",
    });
  });

  it("is NOT returned to a different account on the same browser", () => {
    saveEntryContext(["Planning work"], "quotes take two days", "user_abc");
    expect(loadEntryContext("user_xyz")).toBeNull();
    // Nor to a guest after that account signs out.
    expect(loadEntryContext("guest")).toBeNull();
  });

  it("is withheld while the account is still unknown", () => {
    // Returning it for a null identity is what would flash one person's
    // words up before Clerk has resolved who is actually looking.
    saveEntryContext([], "something", "user_abc");
    expect(loadEntryContext(null)).toBeNull();
  });

  it("does not leave somebody else's words readable in storage", () => {
    saveEntryContext([], "our quoting is a mess", "user_abc");
    purgeForeignEntryContext("user_xyz");
    expect(store.get(KEY)).toBeUndefined();
  });

  it("leaves your own context alone when purging", () => {
    saveEntryContext([], "our quoting is a mess", "user_abc");
    purgeForeignEntryContext("user_abc");
    expect(loadEntryContext("user_abc")).not.toBeNull();
  });

  it("purges nothing while the account is unknown, rather than guessing", () => {
    saveEntryContext([], "mine", "user_abc");
    purgeForeignEntryContext(null);
    expect(loadEntryContext("user_abc")).not.toBeNull();
  });
});

describe("it never touches the diagnostic's own draft", () => {
  it("writes only its own key", () => {
    saveEntryContext(["Repetitive admin"], "too much re-typing", "guest");
    expect([...store.keys()]).toEqual([KEY]);
    expect(store.has(DRAFT_KEY)).toBe(false);
  });

  it("clearing it leaves a real draft in place", () => {
    store.set(DRAFT_KEY, '{"step":2}');
    saveEntryContext([], "text", "guest");
    clearEntryContext();
    expect(store.get(DRAFT_KEY)).toBe('{"step":2}');
  });
});

describe("empty is empty", () => {
  it("stores nothing when neither a chip nor text was given", () => {
    expect(saveEntryContext([], "   ", "guest")).toBeNull();
    expect(store.has(KEY)).toBe(false);
  });

  it("clears a previous context when the visitor deletes everything", () => {
    saveEntryContext(["Planning work"], "x", "guest");
    saveEntryContext([], "", "guest");
    expect(loadEntryContext("guest")).toBeNull();
  });

  it("reads a stored-but-empty record as nothing", () => {
    store.set(KEY, JSON.stringify({ topics: [], text: "", identity: "guest" }));
    expect(loadEntryContext("guest")).toBeNull();
  });
});

describe("it tolerates whatever is actually in storage", () => {
  it("survives unparseable content", () => {
    store.set(KEY, "not json");
    expect(loadEntryContext("guest")).toBeNull();
  });

  it("drops unparseable content on a purge rather than leaving it", () => {
    store.set(KEY, "not json");
    purgeForeignEntryContext("guest");
    expect(store.has(KEY)).toBe(false);
  });

  it("ignores a record written without an identity by an older build", () => {
    store.set(KEY, JSON.stringify({ topics: ["x"], text: "y" }));
    expect(loadEntryContext("guest")).toBeNull();
  });

  it("discards non-string entries in the topics array", () => {
    store.set(
      KEY,
      JSON.stringify({ topics: ["real", 7, null], text: "", identity: "guest" })
    );
    expect(loadEntryContext("guest")?.topics).toEqual(["real"]);
  });

  it("caps the text instead of refusing to store it", () => {
    const long = "x".repeat(ENTRY_TEXT_MAX + 50);
    saveEntryContext([], long, "guest");
    expect(loadEntryContext("guest")?.text).toHaveLength(ENTRY_TEXT_MAX);
  });
});
