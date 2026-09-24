import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildSw, precacheList } from "../tools/build-sw.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const manifest = JSON.parse(read("manifest.webmanifest"));
const precache = new Set(precacheList());

/** Width/height from a PNG's IHDR chunk. */
function pngSize(file) {
  const buf = fs.readFileSync(path.join(ROOT, file));
  assert.equal(buf.toString("ascii", 1, 4), "PNG", `${file} is a PNG`);
  return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
}

test("manifest: installable basics with relative URLs (works under /Bird-Mahjong/)", () => {
  assert.equal(manifest.name, "Bird Mahjong");
  assert.ok(manifest.short_name.length <= 12);
  assert.equal(manifest.start_url, "./");
  assert.equal(manifest.scope, "./");
  assert.equal(manifest.id, "./");
  assert.equal(manifest.display, "standalone");
  assert.match(manifest.background_color, /^#[0-9a-f]{6}$/i);
  assert.match(manifest.theme_color, /^#[0-9a-f]{6}$/i);
});

test("manifest icons exist locally, match their declared sizes, and include maskable", () => {
  const purposes = new Set();
  for (const icon of manifest.icons) {
    assert.ok(!icon.src.startsWith("/") && !/^https?:/.test(icon.src), `${icon.src} is relative`);
    const [w, h] = pngSize(icon.src);
    assert.equal(`${w}x${h}`, icon.sizes, icon.src);
    assert.ok(precache.has(icon.src), `${icon.src} is precached`);
    purposes.add(`${icon.purpose}:${icon.sizes}`);
  }
  for (const needed of ["any:192x192", "any:512x512", "maskable:512x512"]) assert.ok(purposes.has(needed), needed);
  assert.deepEqual(pngSize("icons/apple-touch-icon.png"), [180, 180]);
  assert.deepEqual(pngSize("icons/favicon-32.png"), [32, 32]);
});

test("sw.js is up to date with the files on disk (run `npm run build:sw` if this fails)", () => {
  const { source, next } = buildSw();
  assert.equal(source, next);
});

test("every precached file exists; no absolute paths", () => {
  for (const f of precache) {
    assert.ok(!f.startsWith("/") && !/^https?:/.test(f), f);
    if (f !== "./") assert.ok(fs.existsSync(path.join(ROOT, f)), `${f} exists`);
  }
});

test("every module the game imports is precached", () => {
  const seen = new Set();
  const visit = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    for (const m of read(file).matchAll(/^\s*(?:import|export)\s[^;]*?from\s+"(\.[^"]+)"/gm)) {
      visit(path.posix.normalize(path.posix.join(path.posix.dirname(file), m[1])));
    }
  };
  visit("js/app.js");
  assert.ok(seen.size > 15);
  for (const f of seen) assert.ok(precache.has(f), `${f} is precached`);
});

test("every file index.html loads is relative and precached", () => {
  const html = read("index.html");
  const refs = [...html.matchAll(/<(?:link|script|img)\b[^>]*?\s(?:href|src)="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(refs.length > 10);
  for (const ref of refs) {
    assert.ok(!ref.startsWith("/") && !/^https?:/.test(ref), `${ref} is relative`);
    assert.ok(precache.has(ref), `${ref} is precached`);
  }
});

test("all bird tiles the board and background use are precached", () => {
  for (const dir of ["assets/tiles-sm", "assets/tiles-md"]) {
    const files = fs.readdirSync(path.join(ROOT, dir)).filter((f) => f.endsWith(".webp"));
    assert.equal(files.length, 20, dir);
    for (const f of files) assert.ok(precache.has(`${dir}/${f}`), `${dir}/${f}`);
  }
});

test("the app registers the worker relative to the page, bypassing the HTTP cache", () => {
  const pwa = read("js/pwa.js");
  assert.match(pwa, /register\("\.\/sw\.js", \{ scope: "\.\/", updateViaCache: "none" \}\)/);
  const sw = read("sw.js");
  assert.match(sw, /cache: "reload"/, "install bypasses the HTTP cache");
  assert.doesNotMatch(sw, /self\.skipWaiting\(\);\s*\n\s*\}\);\s*\n\s*self\.addEventListener\("activate"/, "no automatic skipWaiting on install");
});

test("no absolute root paths in app code, styles or markup", () => {
  const files = ["index.html", "css/app.css", ...[...precache].filter((f) => f.endsWith(".js"))];
  for (const f of files) {
    const text = read(f);
    assert.doesNotMatch(text, /(?:src|href)="\/(?!\/)/, `${f}: absolute src/href`);
    assert.doesNotMatch(text, /url\(\s*["']?\/(?!\/)/, `${f}: absolute url()`);
    assert.doesNotMatch(text, /(?:fetch|import)\(\s*["']\/(?!\/)/, `${f}: absolute fetch/import`);
  }
});
