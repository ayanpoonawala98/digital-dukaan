// After a deploy, an open tab can ask for a lazy chunk that no longer exists. One guarded reload fetches the new build.
const KEY = 'dd-chunk-reload-at';
export const isChunkError = e => /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Loading chunk [\w-]+ failed|ChunkLoadError/i.test(String(e?.message || e || '') + ' ' + String(e?.name || ''));
// True at most once per window, so a genuinely broken build cannot reload forever.
export function canReloadNow(storage, now = Date.now(), windowMs = 60000) {
  try { const last = Number(storage.getItem(KEY) || 0); if (last && now - last < windowMs) return false; storage.setItem(KEY, String(now)); return true; } catch { return true; }
}
export function reloadForNewBuild(storage = globalThis.sessionStorage, reload = () => globalThis.location.reload()) {
  if (canReloadNow(storage)) { reload(); return true; }
  return false;
}
