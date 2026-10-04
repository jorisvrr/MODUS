/**
 * What the visitor told us on the homepage, carried to the diagnostic.
 *
 * ## Why not the URL
 *
 * The category chip used to travel as `?hint=`. Free text cannot: a URL is
 * copied, pasted into chat, logged by every proxy in between and kept in
 * browser history. "Our quoting is a mess and Marco is the only one who
 * can do it" is the visitor's business, not something to put in a query
 * string. It travels in session storage instead and never leaves the tab.
 *
 * ## Why its own key
 *
 * Not `modus:diagnostic:v1`. That key holds a real in-progress draft, and
 * anything non-empty in it makes the diagnostic offer to resume a saved
 * session — so writing entry context there would greet a first-time
 * visitor with "continue where you left off?" having answered nothing.
 * This is a separate, smaller thing with a separate key, read as *start
 * context* and never as answers.
 *
 * ## Why identity-scoped
 *
 * Same reason `customerContext/storage.ts` is: unscoped, it survives a
 * sign-out and an account switch, and the next person at that browser is
 * shown the previous one's words. Scoping the read makes that structurally
 * impossible instead of something each caller has to remember, and
 * `purgeForeignEntryContext` removes somebody else's text rather than
 * leaving it readable in storage.
 *
 * Session storage, not local: this is a single visit's intent. It should
 * not resurface in a week.
 */

const KEY = "modus:entry-context:v1";

export type EntryContext = {
  /** The chips they toggled, verbatim and in the order shown. */
  topics: string[];
  /** What they typed, verbatim. Trimmed, never truncated silently. */
  text: string;
  savedAt: number;
  /** Clerk user id, or "guest". */
  identity: string;
};

/** Generous, but not unbounded — storage is shared with the draft. */
export const ENTRY_TEXT_MAX = 500;

export function saveEntryContext(
  topics: readonly string[],
  text: string,
  identity: string
): EntryContext | null {
  const ctx: EntryContext = {
    topics: [...topics],
    text: text.trim().slice(0, ENTRY_TEXT_MAX),
    savedAt: Date.now(),
    identity,
  };
  // Nothing to carry: clear instead of storing an empty record, so a
  // visitor who types and then deletes does not arrive with an empty
  // "you started with" panel.
  if (ctx.topics.length === 0 && ctx.text.length === 0) {
    clearEntryContext();
    return null;
  }
  try {
    sessionStorage.setItem(KEY, JSON.stringify(ctx));
  } catch {
    // Storage unavailable (private browsing, quota). The CTA still works;
    // the visitor simply starts without the carried context.
    return null;
  }
  return ctx;
}

export function loadEntryContext(identity: string | null): EntryContext | null {
  if (typeof window === "undefined") return null;
  // Identity not yet known (Clerk still loading). Returning it here is
  // what would show it for an instant before the account is known.
  if (!identity) return null;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const ctx = JSON.parse(raw) as Partial<EntryContext>;
    if (ctx.identity !== identity) return null;
    const topics = Array.isArray(ctx.topics) ? ctx.topics.filter((t) => typeof t === "string") : [];
    const text = typeof ctx.text === "string" ? ctx.text : "";
    if (topics.length === 0 && text.length === 0) return null;
    return { topics, text, savedAt: Number(ctx.savedAt) || 0, identity };
  } catch {
    return null;
  }
}

export function clearEntryContext() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

/**
 * Drops context belonging to somebody else.
 *
 * A scoped read already prevents it being shown, but leaving the previous
 * account's own words sitting in storage after they signed out is not
 * acceptable on its own.
 */
export function purgeForeignEntryContext(identity: string | null) {
  if (typeof window === "undefined" || !identity) return;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return;
    const ctx = JSON.parse(raw) as Partial<EntryContext>;
    if (ctx.identity !== identity) sessionStorage.removeItem(KEY);
  } catch {
    // Unparseable: it cannot be attributed to anyone, so it goes.
    clearEntryContext();
  }
}
