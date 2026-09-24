import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Read the palette straight from css/app.css so this can't drift from the CSS.
const css = readFileSync(new URL("../css/app.css", import.meta.url), "utf8");
const root = css.slice(css.indexOf(":root {"), css.indexOf("}", css.indexOf(":root {")));
const tokens = Object.fromEntries([...root.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]));
tokens.white = "#ffffff";

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// Every text-colour / background pairing the UI uses.
// The page gradient's sky-tinted top (see body background) is a background too.
tokens["page-top"] = "#dcecf6";

const PAIRS = [
  ["leaf-dark", "page-top"], ["bark", "page-top"], ["bark-soft", "page-top"], ["sky-ink", "page-top"],
  ["bark", "paper"], ["bark", "ivory"], ["bark", "ivory-deep"],
  ["bark-soft", "paper"], ["bark-soft", "ivory"], ["bark-soft", "ivory-deep"],
  ["leaf", "paper"], ["leaf-dark", "paper"], ["leaf-dark", "ivory"], ["leaf-dark", "leaf-tint"],
  ["sky-ink", "paper"], ["sky-ink", "ivory"], ["sky-ink", "sky-tint"],
  ["cardinal", "paper"], ["cardinal", "ivory"],
  ["white", "leaf"], ["white", "leaf-dark"], ["white", "sky-ink"],
];

test("the palette tokens were found", () => {
  for (const name of ["bark", "bark-soft", "leaf", "leaf-dark", "leaf-tint", "sky-ink", "sky-tint", "cardinal", "paper", "ivory", "ivory-deep"]) {
    assert.match(tokens[name] ?? "", /^#[0-9a-f]{6}$/i, name);
  }
});

for (const [fg, bg] of PAIRS) {
  test(`${fg} on ${bg} meets WCAG AA for body text (4.5:1)`, () => {
    const ratio = contrast(tokens[fg], tokens[bg]);
    assert.ok(ratio >= 4.5, `${ratio.toFixed(2)}:1`);
  });
}

test("the focus ring (cardinal) stands out from tiles and the board felt (3:1 for UI)", () => {
  for (const bg of ["paper", "ivory", "leaf-tint"]) {
    assert.ok(contrast(tokens.cardinal, tokens[bg]) >= 3, bg);
  }
});
