"use client";

import type { ComponentProps } from "react";
import { Text } from "@react-three/uikit";

/**
 * uikit `Text`, with every character forced into the range the font atlas can
 * actually draw.
 *
 * THE ATLAS IS ASCII. uikit renders from a signed-distance atlas rather than a
 * real font file, and `@pmndrs/msdfonts/inter` ships 104 glyphs — the printable
 * ASCII set and almost nothing else. A character outside it is not substituted
 * or boxed; it is DROPPED, and uikit logs `Missing glyph info for character`
 * once per character per layout pass.
 *
 * That is not a hypothetical for this site. `scenes.json` is authored with
 * real typography, and the strings VR renders contain:
 *
 *     —  em dash        64 occurrences   "Heavy flow — expect queues."
 *     ·  middle dot     16               "Multi-level structure · near the ..."
 *     →  right arrow     4               "concourse → Level 2 gates → assembly"
 *     –  en dash         4               "Level 3 Gates 1–3"
 *     ×  multiply        1               "100m, long jump, 4×400m relay"
 *     é  e-acute         1               "Village Café"
 *
 * So opening Layouts on the memorial meant a panel full of sentences with holes
 * punched in them, and a console filling with warnings. Neither is a font
 * problem to be fixed in the font: shipping a wider atlas costs megabytes of
 * texture for six characters.
 *
 * TRANSLITERATION, NOT DELETION. Each character is mapped to the nearest ASCII
 * that keeps the sentence readable — an em dash becomes a hyphen, an arrow
 * becomes `->`, an accented letter loses its accent. Only a character with no
 * sensible ASCII reading is dropped, which is the behaviour uikit already had
 * for everything.
 *
 * The 3D hotspot LABELS do not go through this: those are drei/troika `Text`,
 * which loads a real font file and can draw anything.
 */

/**
 * Characters with a deliberate reading. Anything not here falls through to
 * Unicode decomposition, which handles the accented letters generically.
 */
const ASCII: Record<string, string> = {
  "—": "-", // em dash
  "–": "-", // en dash
  "‒": "-", // figure dash
  "−": "-", // minus sign
  "…": "...", // ellipsis
  "·": "-", // middle dot, used as a separator in this data
  "•": "-", // bullet
  "→": "->", // rightwards arrow
  "←": "<-",
  "×": "x", // multiplication sign
  "‘": "'",
  "’": "'",
  "“": '"',
  "”": '"',
  " ": " ", // non-breaking space
  " ": " ", // thin space
  " ": " ", // narrow no-break space
  "°": " deg",
  "½": "1/2",
  "¼": "1/4",
  "¾": "3/4",
};

/** Highest code point the atlas covers. */
const MAX_ASCII = 0x7e;

export function toAtlasSafe(input: string): string {
  let out = "";

  for (const char of input) {
    const code = char.codePointAt(0) ?? 0;

    if (code >= 0x20 && code <= MAX_ASCII) {
      out += char;
      continue;
    }

    const mapped = ASCII[char];
    if (mapped !== undefined) {
      out += mapped;
      continue;
    }

    /**
     * Accents, generically: NFKD splits `é` into `e` plus a combining acute,
     * and dropping the combining marks leaves the base letter. This is what
     * saves every future string nobody thought to add to the table above.
     */
    const decomposed = char.normalize("NFKD").replace(/[̀-ͯ]/g, "");

    for (const part of decomposed) {
      const partCode = part.codePointAt(0) ?? 0;
      // Anything still outside the atlas is dropped, which is what uikit would
      // have done anyway — only now it is silent and deliberate.
      if (partCode >= 0x20 && partCode <= MAX_ASCII) out += part;
    }
  }

  // An em dash already surrounded by spaces becomes " - ", which is correct,
  // but a dropped character can leave a double space behind. Tidy once.
  return out.replace(/[ \t]{2,}/g, " ").trim();
}

/**
 * Drop-in for uikit's `Text`. Use this everywhere in the VR UI rather than
 * `Text` directly, so no call site has to remember which strings came from
 * `scenes.json`.
 */
export function VRText({
  children,
  ...props
}: Omit<ComponentProps<typeof Text>, "children"> & { children: string }) {
  return <Text {...props}>{toAtlasSafe(children)}</Text>;
}
