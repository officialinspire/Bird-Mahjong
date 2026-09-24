// Settings persisted in localStorage. Storage can be unavailable (private
// mode, blocked site data), so every access is guarded and defaults apply.

const STORAGE_KEY = "inspireBirdMahjong:v1:settings";

export const DEFAULT_SETTINGS = Object.freeze({
  motion: "system",        // "system" | "reduce" | "full"
  backgroundBirds: true,
  tileLabels: false,
});

export function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return sanitize({ ...DEFAULT_SETTINGS, ...saved });
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Not persisted this session; the in-memory settings still apply.
  }
}

function sanitize(s) {
  return {
    motion: ["system", "reduce", "full"].includes(s.motion) ? s.motion : DEFAULT_SETTINGS.motion,
    backgroundBirds: Boolean(s.backgroundBirds),
    tileLabels: Boolean(s.tileLabels),
  };
}
