/**
 * Escaping for email HTML.
 *
 * Everything that reaches these templates from a diagnostic is typed by a
 * visitor: company names, free-text descriptions, email addresses. An
 * email body is HTML in somebody's inbox, so the same rule applies as on a
 * page — nothing submitted is ever concatenated into markup unescaped.
 *
 * React does this for the website. There is no React here: these strings
 * are built by hand, which is exactly why it has to be explicit.
 */

const ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ENTITIES[c] ?? c);
}

/**
 * A URL that is safe to put in `href`.
 *
 * Only absolute http(s). Anything else — `javascript:`, `data:`, a
 * protocol-relative `//evil.example`, or a relative path that would
 * resolve against the mail client rather than the site — returns null, and
 * the caller renders text instead of a link.
 *
 * Every link these templates emit is built from server configuration and a
 * record id, never from submitted content; this is the belt that makes
 * that true even if a future caller forgets.
 */
export function safeHref(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  return escapeHtml(url.toString());
}

/** Strips CR/LF so submitted content cannot inject extra mail headers. */
export function headerSafe(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

/**
 * Collapses a free-text answer for a single-line context, keeping it
 * readable. Used for subjects and summary rows, never for the body copy,
 * which keeps the visitor's own line breaks.
 */
export function oneLine(value: string, max = 160): string {
  const flat = value.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}
