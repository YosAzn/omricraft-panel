// Returns true if `version` is newer than the proxy's native max (1.21.11) and
// therefore relies on ViaVersion on the Velocity proxy to bridge older clients.
export function isViaVersion(version) {
  if (typeof version !== 'string') return false;
  const m = version.match(/^1\.(\d+)(?:\.(\d+))?$/);
  if (m) {
    const minor = parseInt(m[1], 10);
    const patch = parseInt(m[2] || '0', 10);
    if (minor < 21) return false;
    if (minor > 21) return true;
    return patch > 11; // 1.21.x where x > 11
  }
  // Non 1.x scheme (e.g. 26.1.2) → definitely newer than 1.21.11.
  return !version.startsWith('1.');
}
