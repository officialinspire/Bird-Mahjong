import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { DEFAULT_SETTINGS, loadSettings, sanitize, saveSettings, SETTINGS_KEY } from "../js/settings.js";
import { memoryStorage, openStorage } from "../js/storage.js";

const fresh = () => openStorage(memoryStorage()).storage;
const stored = (storage) => JSON.parse(storage.getItem(SETTINGS_KEY));

describe("audio settings", () => {
  test("defaults: music and sound effects are separate, each with its own volume", () => {
    assert.equal(DEFAULT_SETTINGS.music, true);
    assert.equal(DEFAULT_SETTINGS.sfx, true);
    assert.ok(DEFAULT_SETTINGS.musicVolume > 0 && DEFAULT_SETTINGS.musicVolume <= 1);
    assert.ok(DEFAULT_SETTINGS.sfxVolume > 0 && DEFAULT_SETTINGS.sfxVolume <= 1);
    assert.ok(DEFAULT_SETTINGS.musicVolume < DEFAULT_SETTINGS.sfxVolume, "music sits under effects");
    assert.deepEqual(loadSettings(fresh()), DEFAULT_SETTINGS);
  });

  test("music and sound effects switch independently and persist", () => {
    for (const [music, sfx] of [[true, false], [false, true], [false, false], [true, true]]) {
      const storage = fresh();
      saveSettings({ ...DEFAULT_SETTINGS, music, sfx, musicVolume: 0.15, sfxVolume: 0.85 }, storage);
      const loaded = loadSettings(storage);
      assert.equal(loaded.music, music);
      assert.equal(loaded.sfx, sfx);
      assert.equal(loaded.musicVolume, 0.15);
      assert.equal(loaded.sfxVolume, 0.85);
    }
  });

  test("a muted channel keeps its volume for when it's switched back on", () => {
    const storage = fresh();
    saveSettings({ ...DEFAULT_SETTINGS, music: false, musicVolume: 0.2 }, storage);
    const back = loadSettings(storage);
    saveSettings({ ...back, music: true }, storage);
    assert.equal(loadSettings(storage).musicVolume, 0.2);
  });

  test("volumes are clamped to 0..1 and bad values fall back per field", () => {
    assert.equal(sanitize({ musicVolume: 3 }).musicVolume, 1);
    assert.equal(sanitize({ sfxVolume: -1 }).sfxVolume, 0);
    assert.equal(sanitize({ musicVolume: 0 }).musicVolume, 0, "zero is a valid volume");
    for (const junk of ["0.5", null, NaN, Infinity, {}, [], true]) {
      assert.equal(sanitize({ musicVolume: junk }).musicVolume, DEFAULT_SETTINGS.musicVolume, String(junk));
      assert.equal(sanitize({ sfxVolume: junk }).sfxVolume, DEFAULT_SETTINGS.sfxVolume, String(junk));
    }
    for (const junk of ["false", 0, 1, null, "on"]) {
      assert.equal(sanitize({ music: junk }).music, DEFAULT_SETTINGS.music, `music ${junk}`);
      assert.equal(sanitize({ sfx: junk }).sfx, DEFAULT_SETTINGS.sfx, `sfx ${junk}`);
    }
  });

  test("one bad field doesn't reset the others", () => {
    const s = sanitize({ music: false, musicVolume: "loud", sfx: false, sfxVolume: 0.3, motion: "sideways", tileLabels: true });
    assert.deepEqual(s, { ...DEFAULT_SETTINGS, music: false, sfx: false, sfxVolume: 0.3, tileLabels: true });
  });
});

describe("older saves", () => {
  test("the old single Sound switch and volume carry over to Sound effects", () => {
    const storage = fresh();
    storage.setItem(SETTINGS_KEY, JSON.stringify({ motion: "reduce", sound: false, soundVolume: 0.25 }));
    const loaded = loadSettings(storage);
    assert.equal(loaded.sfx, false);
    assert.equal(loaded.sfxVolume, 0.25);
    assert.equal(loaded.music, DEFAULT_SETTINGS.music, "music wasn't a setting before: default");
    assert.equal(loaded.motion, "reduce", "other settings are kept");
  });

  test("new keys win over old ones when both are present", () => {
    const s = sanitize({ sound: false, soundVolume: 0.1, sfx: true, sfxVolume: 0.9 });
    assert.equal(s.sfx, true);
    assert.equal(s.sfxVolume, 0.9);
  });

  test("old keys are validated too, and are not written back", () => {
    assert.equal(sanitize({ soundVolume: 7 }).sfxVolume, 1);
    assert.equal(sanitize({ sound: "yes" }).sfx, DEFAULT_SETTINGS.sfx);
    const storage = fresh();
    storage.setItem(SETTINGS_KEY, JSON.stringify({ sound: false, soundVolume: 0.4, extra: 1 }));
    saveSettings(loadSettings(storage), storage);
    const raw = stored(storage);
    assert.ok(!("sound" in raw) && !("soundVolume" in raw) && !("extra" in raw));
    assert.deepEqual(Object.keys(raw).sort(), Object.keys(DEFAULT_SETTINGS).sort());
  });
});

describe("safe persistence", () => {
  test("corrupt or wrong-shaped data gives defaults", () => {
    for (const raw of ["{nope", "null", "[]", "42", '"music"', ""]) {
      const storage = fresh();
      storage.setItem(SETTINGS_KEY, raw);
      assert.deepEqual(loadSettings(storage), DEFAULT_SETTINGS, raw);
    }
  });

  test("storage that throws never breaks loading or saving", () => {
    const hostile = { getItem() { throw new Error("SecurityError"); }, setItem() { throw new Error("QuotaExceededError"); }, removeItem() {} };
    const { storage, persistent } = openStorage(hostile);
    assert.equal(persistent, false);
    assert.deepEqual(loadSettings(storage), DEFAULT_SETTINGS);
    assert.doesNotThrow(() => saveSettings({ ...DEFAULT_SETTINGS, music: false }, storage));
    assert.equal(loadSettings(storage).music, false, "kept in memory for the session");
  });

  test("a write that fails mid-session doesn't throw and keeps the last good value", () => {
    const raw = memoryStorage();
    const { storage } = openStorage(raw);
    saveSettings({ ...DEFAULT_SETTINGS, sfxVolume: 0.3 }, storage);
    raw.setItem = () => { throw new Error("QuotaExceededError"); };
    assert.doesNotThrow(() => saveSettings({ ...DEFAULT_SETTINGS, sfxVolume: 0.9 }, storage));
    assert.equal(loadSettings(storage).sfxVolume, 0.3);
  });

  test("sanitize is idempotent", () => {
    const once = sanitize({ music: false, musicVolume: 2, sound: false, junk: 1 });
    assert.deepEqual(sanitize(once), once);
  });
});

describe("settings screen", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

  test("has separate Music and Sound effects switches and volume sliders", () => {
    for (const name of ["music", "sfx"]) {
      assert.match(html, new RegExp(`<input type="checkbox" name="${name}" role="switch">`));
    }
    for (const name of ["musicVolume", "sfxVolume"]) {
      assert.match(html, new RegExp(`<input type="range" name="${name}" min="0" max="100"`));
    }
    assert.doesNotMatch(html, /name="sound"|name="soundVolume"/, "the old single control is gone");
  });

  test("every saved setting has a control, and every control is saved", () => {
    const names = new Set([...html.matchAll(/<input[^>]*name="(\w+)"/g)].map((m) => m[1]));
    assert.deepEqual([...names].sort(), Object.keys(DEFAULT_SETTINGS).sort());
  });
});
