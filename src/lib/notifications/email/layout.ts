import { escapeHtml, safeHref } from "./html";

/**
 * The shared MODUS email shell: header image, content blocks, footer.
 *
 * ## Why blocks rather than two hand-written templates
 *
 * Every mail has to exist twice — as HTML and as plain text — and the two
 * must say the same thing. Writing each one twice by hand is how they
 * drift, and a text part that disagrees with the HTML part is worse than
 * no text part at all. So a mail is a list of blocks, and the two
 * renderers walk the same list.
 *
 * It is also what the weekly mails will need: they are a different list of
 * the same blocks, not a different shell. Nothing weekly is built here —
 * no schedule, no subscription, no extra sending — only the pieces that
 * one would reuse.
 *
 * ## Email HTML, not web HTML
 *
 * Tables with `role="presentation"`, inline styles, a 600px cap, and no
 * reliance on anything a mail client is free to drop. The single `<style>`
 * block carries a media query and nothing the mail depends on: strip it
 * and the layout still holds, because the widths are attributes.
 */

export const EMAIL = {
  /** Warm cream surface, the site's own `--surface`. */
  surface: "#F4F4E7",
  /** The slightly darker ground the card sits on, `--canvas`. */
  canvas: "#D7D7D0",
  ink: "#1A1614",
  graphite: "#3C3834",
  muted: "#585751",
  line: "#BDBDB5",
  /** MODUS green, `--accent`. */
  accent: "#1E3B2E",
  accentForeground: "#FFFFFF",
  width: 600,
} as const;

const FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";

export type Block =
  | { kind: "paragraph"; text: string }
  | { kind: "heading"; text: string }
  /** Label/value pairs. A row with an empty value is dropped, not blanked. */
  | { kind: "facts"; rows: { label: string; value: string }[] }
  /**
   * A heading and its rows, as one thing.
   *
   * The whole section disappears when none of its rows have a value. A
   * heading with nothing under it is the empty space this is meant to
   * avoid: a sparse submission produced "Wat ze willen verbeteren"
   * followed by a rule and then the next heading.
   */
  | { kind: "section"; heading: string; rows: { label: string; value: string }[] }
  | { kind: "button"; label: string; href: string }
  | { kind: "divider" }
  /** Small, quiet copy — a caveat, never a claim. */
  | { kind: "note"; text: string }
  | { kind: "signature"; lines: string[] };

export type EmailDocument = {
  /** The site's absolute origin. Images and links in mail must be absolute. */
  origin: string;
  /** `lang` on the document, so a screen reader pronounces it correctly. */
  lang: string;
  /** The first line most clients show after the subject. */
  preheader: string;
  blocks: Block[];
  footer: {
    /** Link text in the HTML footer, where the link itself is the label. */
    siteLabel: string;
    contactEmail: string;
    privacyLabel: string;
    privacyPath: string;
    /**
     * Words for the text part, where a label and its value are separate
     * lines. Without these the text footer read "joris@withmodus.co:
     * joris@withmodus.co", which is the HTML's label used where it makes
     * no sense.
     */
    text: { site: string; contact: string; privacy: string };
  };
};

/**
 * The header image.
 *
 * Versioned in the filename, because mail clients and their image proxies
 * cache aggressively and by URL — replacing the artwork means a new file,
 * not a new copy at the same path. 1200×400, displayed at 600×200, so it
 * stays sharp on a high-density screen.
 */
export const EMAIL_HEADER_PATH = "/brand/email-header-v1.jpg";
export const EMAIL_HEADER_ALT = "MODUS";

function rowsWithValues(rows: { label: string; value: string }[]) {
  return rows.filter((r) => r.value.trim().length > 0);
}

/** True when a block would render to nothing. */
function isEmpty(block: Block): boolean {
  if (block.kind === "facts") return rowsWithValues(block.rows).length === 0;
  if (block.kind === "section") return rowsWithValues(block.rows).length === 0;
  if (block.kind === "paragraph" || block.kind === "note" || block.kind === "heading") {
    return block.text.trim().length === 0;
  }
  if (block.kind === "signature") return block.lines.length === 0;
  return false;
}

/**
 * Drops what would render to nothing, then tidies the rules around the
 * gaps that leaves: no leading or trailing divider, and never two in a
 * row. Without this, removing an empty section leaves its two dividers
 * stacked against each other, which reads as a mistake rather than as an
 * absence.
 */
export function normaliseBlocks(blocks: Block[]): Block[] {
  const kept = blocks.filter((b) => !isEmpty(b));
  const out: Block[] = [];
  for (const block of kept) {
    if (block.kind === "divider") {
      if (out.length === 0) continue;
      if (out[out.length - 1].kind === "divider") continue;
    }
    out.push(block);
  }
  while (out.length > 0 && out[out.length - 1].kind === "divider") out.pop();
  return out;
}

function blockHtml(block: Block, origin: string): string {
  switch (block.kind) {
    case "heading":
      return `<tr><td style="padding:0 0 10px 0;font-family:${FONT};font-size:17px;line-height:24px;font-weight:600;color:${EMAIL.ink};">${escapeHtml(
        block.text
      )}</td></tr>`;

    case "paragraph":
      return `<tr><td style="padding:0 0 16px 0;font-family:${FONT};font-size:15px;line-height:23px;color:${EMAIL.graphite};">${escapeHtml(
        block.text
      ).replace(/\n/g, "<br />")}</td></tr>`;

    case "note":
      return `<tr><td style="padding:0 0 16px 0;font-family:${FONT};font-size:13px;line-height:20px;color:${EMAIL.muted};">${escapeHtml(
        block.text
      )}</td></tr>`;

    case "divider":
      return `<tr><td style="padding:6px 0 22px 0;"><div style="height:1px;line-height:1px;font-size:0;background-color:${EMAIL.line};">&nbsp;</div></td></tr>`;

    case "section":
      return (
        blockHtml({ kind: "heading", text: block.heading }, origin) +
        blockHtml({ kind: "facts", rows: block.rows }, origin)
      );

    case "facts": {
      const rows = rowsWithValues(block.rows);
      if (rows.length === 0) return "";
      const cells = rows
        .map(
          (r) =>
            `<tr>` +
            `<td style="padding:0 14px 8px 0;font-family:${FONT};font-size:12px;line-height:18px;color:${EMAIL.muted};white-space:nowrap;vertical-align:top;">${escapeHtml(
              r.label
            )}</td>` +
            `<td style="padding:0 0 8px 0;font-family:${FONT};font-size:14px;line-height:20px;color:${EMAIL.ink};vertical-align:top;">${escapeHtml(
              r.value
            ).replace(/\n/g, "<br />")}</td>` +
            `</tr>`
        )
        .join("");
      return `<tr><td style="padding:0 0 18px 0;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${cells}</table></td></tr>`;
    }

    case "button": {
      const href = safeHref(block.href);
      // No link rather than a broken or unsafe one. The label still tells
      // the reader what they are missing.
      if (!href) {
        return `<tr><td style="padding:4px 0 20px 0;font-family:${FONT};font-size:14px;color:${EMAIL.muted};">${escapeHtml(
          block.label
        )}</td></tr>`;
      }
      return (
        `<tr><td style="padding:4px 0 22px 0;">` +
        `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>` +
        `<td bgcolor="${EMAIL.accent}" style="border-radius:4px;">` +
        `<a href="${href}" style="display:inline-block;padding:12px 22px;font-family:${FONT};font-size:14px;font-weight:600;line-height:18px;color:${EMAIL.accentForeground};text-decoration:none;border-radius:4px;">${escapeHtml(
          block.label
        )}</a>` +
        `</td></tr></table></td></tr>`
      );
    }

    case "signature":
      return (
        `<tr><td style="padding:4px 0 0 0;font-family:${FONT};font-size:15px;line-height:23px;color:${EMAIL.graphite};">` +
        block.lines
          .map((line) => {
            const href = safeHref(line);
            if (href) {
              return `<a href="${href}" style="color:${EMAIL.accent};text-decoration:underline;">${escapeHtml(
                line
              )}</a>`;
            }
            return escapeHtml(line);
          })
          .join("<br />") +
        `</td></tr>`
      );
  }
  // `origin` is part of the signature so future blocks can build absolute
  // URLs without changing every call site.
  void origin;
  return "";
}

export function renderEmailHtml(doc: EmailDocument): string {
  const origin = doc.origin.replace(/\/$/, "");
  const headerSrc = safeHref(`${origin}${EMAIL_HEADER_PATH}`);
  const site = safeHref(origin);
  const privacy = safeHref(`${origin}${doc.footer.privacyPath}`);
  const body = normaliseBlocks(doc.blocks)
    .map((b) => blockHtml(b, origin))
    .join("");

  /*
   * The alt text is styled, and the cell behind it carries the brand
   * green, because a great many people read mail with images off — and
   * every image proxy fails sometimes. Unstyled, a blocked header is 200
   * pixels of nothing above the first word. Styled, it is the word MODUS
   * in white on green, which is what the image says anyway.
   */
  const headerCell = headerSrc
    ? `<img src="${headerSrc}" width="${EMAIL.width}" height="200" alt="${escapeHtml(
        EMAIL_HEADER_ALT
      )}" style="display:block;width:100%;max-width:${EMAIL.width}px;height:auto;border:0;outline:none;text-decoration:none;color:${EMAIL.accentForeground};font-family:${FONT};font-size:22px;font-weight:600;letter-spacing:0.14em;line-height:200px;text-align:center;" />`
    : `<div style="font-family:${FONT};font-size:22px;font-weight:600;letter-spacing:0.14em;color:${EMAIL.accentForeground};line-height:72px;text-align:center;">${escapeHtml(
        EMAIL_HEADER_ALT
      )}</div>`;

  const footerLinks = [
    site ? `<a href="${site}" style="color:${EMAIL.muted};text-decoration:underline;">${escapeHtml(doc.footer.siteLabel)}</a>` : null,
    `<a href="mailto:${escapeHtml(doc.footer.contactEmail)}" style="color:${EMAIL.muted};text-decoration:underline;">${escapeHtml(
      doc.footer.contactEmail
    )}</a>`,
    privacy
      ? `<a href="${privacy}" style="color:${EMAIL.muted};text-decoration:underline;">${escapeHtml(doc.footer.privacyLabel)}</a>`
      : null,
  ]
    .filter(Boolean)
    .join(`<span style="color:${EMAIL.line};"> &nbsp;·&nbsp; </span>`);

  return `<!doctype html>
<html lang="${escapeHtml(doc.lang)}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light only" />
<meta name="supported-color-schemes" content="light only" />
<title>${escapeHtml(doc.preheader)}</title>
<style>
  /* Nothing the layout depends on: the widths are attributes, so a client
     that drops this still renders correctly. */
  @media only screen and (max-width: 620px) {
    .modus-card { padding: 22px 20px 26px 20px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:${EMAIL.canvas};">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${escapeHtml(
    doc.preheader
  )}</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${EMAIL.canvas};">
<tr><td align="center" style="padding:24px 12px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${EMAIL.width}" style="width:100%;max-width:${EMAIL.width}px;background-color:${EMAIL.surface};">
    <tr><td bgcolor="${EMAIL.accent}" style="font-size:0;line-height:0;background-color:${EMAIL.accent};">${headerCell}</td></tr>
    <tr><td class="modus-card" style="padding:28px 32px 30px 32px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${body}</table>
    </td></tr>
    <tr><td style="padding:0 32px;"><div style="height:1px;line-height:1px;font-size:0;background-color:${EMAIL.line};">&nbsp;</div></td></tr>
    <tr><td style="padding:16px 32px 26px 32px;font-family:${FONT};font-size:12px;line-height:19px;color:${EMAIL.muted};">${footerLinks}</td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;
}

function blockText(block: Block): string | null {
  switch (block.kind) {
    case "heading":
      return block.text;
    case "paragraph":
    case "note":
      return block.text;
    case "divider":
      return "----------------------------------------";
    case "section": {
      const rows = rowsWithValues(block.rows);
      if (rows.length === 0) return null;
      const body = blockText({ kind: "facts", rows: block.rows });
      return body ? `${block.heading}\n${body}` : null;
    }
    case "facts": {
      const rows = rowsWithValues(block.rows);
      if (rows.length === 0) return null;
      const width = Math.max(...rows.map((r) => r.label.length));
      return rows
        .map((r) => `${r.label.padEnd(width)}  ${r.value.replace(/\n/g, "\n" + " ".repeat(width + 2))}`)
        .join("\n");
    }
    case "button":
      // The label AND the destination: a text reader cannot click a word.
      return safeHref(block.href) ? `${block.label}: ${block.href}` : block.label;
    case "signature":
      return block.lines.join("\n");
  }
  return null;
}

export function renderEmailText(doc: EmailDocument): string {
  const origin = doc.origin.replace(/\/$/, "");
  const parts = normaliseBlocks(doc.blocks)
    .map(blockText)
    .filter((p): p is string => p !== null && p.trim().length > 0);
  const footer = [
    `${doc.footer.text.site}: ${origin}`,
    `${doc.footer.text.contact}: ${doc.footer.contactEmail}`,
    `${doc.footer.text.privacy}: ${origin}${doc.footer.privacyPath}`,
  ].join("\n");
  return `${parts.join("\n\n")}\n\n--\n${footer}\n`;
}
