// Extract a title + readable text excerpt from fetched source bytes (server-only).
//
// HTML  -> cheerio: <title> + visible body text.
// PDF   -> no full parser (yet): we pull printable latin strings out of the raw
//          bytes as a rough excerpt and say so honestly. The content HASH (not the
//          excerpt) is what drives change detection, so this is sufficient for the
//          monitor's job; a proper PDF parser can upgrade the excerpt later.
// other -> content-type note only.

import * as cheerio from "cheerio";

export interface ExtractedSource {
  kind: "html" | "pdf" | "other";
  title: string;
  excerpt: string; // capped, human-readable
  extraction_note: string;
}

const EXCERPT_CHARS = 2000;

function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function extractSourceText(bytes: Buffer, contentType: string, url: string): ExtractedSource {
  const ct = contentType.toLowerCase();

  if (ct.includes("text/html") || ct.includes("xhtml")) {
    const $ = cheerio.load(bytes.toString("utf8"));
    $("script, style, noscript, nav, footer, iframe").remove();
    const title = collapse($("title").first().text()) || url;
    const excerpt = collapse($("body").text()).slice(0, EXCERPT_CHARS);
    return { kind: "html", title, excerpt, extraction_note: "HTML parsed (title + visible text)." };
  }

  if (ct.includes("pdf") || url.toLowerCase().endsWith(".pdf")) {
    // Rough printable-string scrape — good enough for a human-readable hint;
    // change detection relies on the byte hash, never on this excerpt.
    const raw = bytes.toString("latin1");
    const strings = raw.match(/[ -~]{6,}/g) ?? [];
    const readable = collapse(
      strings
        .filter((s) => {
          // Drop PDF structure (dictionaries, object/stream markers, name tokens)
          // and keep only strings that are mostly prose-like characters.
          if (/^(obj|endobj|endstream|stream|xref)/.test(s) || s.includes("<<") || s.includes(">>") || s.startsWith("/")) return false;
          if (!/[a-zA-Z]{4,}/.test(s)) return false;
          const proseChars = (s.match(/[a-zA-Z\s.,;:'()-]/g) ?? []).length;
          return proseChars / s.length > 0.8;
        })
        .join(" "),
    );
    // Compressed PDFs yield only noise — require signs of natural language before
    // presenting anything as an excerpt. An empty excerpt is honest; garbage is not.
    const stopwordHits = (readable.match(/\b(?:the|and|of|to|in|for|is|on|with|by|as|at)\b/gi) ?? []).length;
    const excerpt = stopwordHits >= 3 ? readable.slice(0, EXCERPT_CHARS) : "";
    return {
      kind: "pdf",
      title: url.split("/").pop() ?? "PDF document",
      excerpt,
      extraction_note: excerpt
        ? `PDF (${bytes.length.toLocaleString()} bytes) — rough text scrape; change detection uses the byte hash.`
        : `PDF (${bytes.length.toLocaleString()} bytes) — text is compressed/non-extractable, so no readable excerpt is shown. Change detection uses the byte hash; open the source URL for the document itself.`,
    };
  }

  return {
    kind: "other",
    title: url,
    excerpt: "",
    extraction_note: `Unhandled content type (${contentType}) — hash-only monitoring.`,
  };
}
