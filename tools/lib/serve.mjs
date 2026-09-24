// Static server for browser checks: serves the repo under a GitHub Pages-style
// sub-path so relative asset paths are exercised the way the live site uses them.

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const BASE = "/Bird-Mahjong/";

const TYPES = {
  ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".mjs": "text/javascript",
  ".json": "application/json", ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg",
  ".webmanifest": "application/manifest+json",
};

/**
 * Start the server; resolves to { server, origin, url, overrides, log }.
 * `overrides` maps a repo-relative path to replacement content, so tests can
 * publish a "new version" of a file mid-run. `log` records every request as
 * { path, status }.
 */
export function serve() {
  const overrides = new Map();
  const log = [];
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    const end = (status) => { log.push({ path: url.pathname, status }); res.writeHead(status).end(); };
    if (!url.pathname.startsWith(BASE)) { end(404); return; }
    const rel = decodeURIComponent(url.pathname.slice(BASE.length)) || "index.html";
    if (overrides.has(rel)) {
      log.push({ path: url.pathname, status: 200 });
      res.writeHead(200, { "content-type": TYPES[path.extname(rel)] || "application/octet-stream" });
      res.end(overrides.get(rel));
      return;
    }
    const file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      end(404); return;
    }
    log.push({ path: url.pathname, status: 200 });
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => {
    const origin = `http://127.0.0.1:${server.address().port}`;
    resolve({ server, origin, url: `${origin}${BASE}`, overrides, log });
  }));
}

/** Chromium, from CHROMIUM_PATH if set, otherwise Playwright's download. */
export function launchBrowser() {
  return chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
}
