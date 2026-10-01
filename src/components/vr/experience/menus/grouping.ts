import { CROWD_WORD } from "@/components-v5/shared/crowd-display";

/**
 * How a menu list is broken up.
 *
 * TWO LEVELS, because `scenes.json` authors two and the flat site renders both:
 * a CATEGORY (`pois` key — "layouts", "seating", "services") and inside it a
 * SUBCATEGORY (`option` — "Entrances & Gates", "Level 1", "Medical"). The flat
 * destination panel shows the first as its tabs and the second as a chip rail.
 *
 * VR flattened both away and listed everything under the category alone, which
 * on the two venues that matter is not a small loss: the memorial files 26 POIs
 * across 19 subcategories and the stadium 36 across 22. "Seat Views" as one
 * undifferentiated list of twelve is a list you scroll looking for a level
 * number in a label; "Seat Views / Level 1" is two presses and three rows.
 *
 * Order is `scenes.json`'s own in both cases, never sorted. That order is
 * editorial — gates before seat views, because that is the order you meet them
 * walking in — and alphabetising it would put "Accessibility" before the way in.
 */

export interface Grouped<T> {
  group: string;
  /** Subcategories in declaration order. A venue with no `option` values
   *  produces a single unnamed section, which renders as a plain list. */
  sections: { option: string | null; items: T[] }[];
}

export function groupByCategoryAndOption<
  T extends { group: string; option?: string },
>(items: T[]): Grouped<T>[] {
  const out: Grouped<T>[] = [];

  for (const item of items) {
    let group = out.find((g) => g.group === item.group);
    if (!group) {
      group = { group: item.group, sections: [] };
      out.push(group);
    }

    const key = item.option ?? null;
    let section = group.sections.find((s) => s.option === key);
    if (!section) {
      section = { option: key, items: [] };
      group.sections.push(section);
    }

    section.items.push(item);
  }

  return out;
}

/**
 * The crowd level as a word, for a row's trailing slot.
 *
 * The SHARED word (`CROWD_WORD`: Heavy / Moderate / Clear), the same one the
 * place card and the crowd board print. This used to say Busy / Steady / Clear,
 * so one gate read "Busy" in the list and "Heavy" a press later.
 */
export function crowdLabel(crowd: string | undefined): string | undefined {
  return crowd ? CROWD_WORD[crowd] : undefined;
}
