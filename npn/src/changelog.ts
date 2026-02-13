export function truncateChangelog(content: string, currentVersion: string): string {
  // Regex to match markdown headings with versions, e.g., "## [1.2.3]", "### v1.2.3", "## 1.2.3 - 2024-01-01"
  // Captures the version string in the first group
  const headingRe = /^(?:#{1,3})\s+.*?\b\[?v?(\d+\.\d+\.\d+(?:-[\w.]+)?)\]?\b/gm;

  const matches: Array<{ pos: number; version: string }> = [];
  let match: RegExpExecArray | null;

  // Use a fresh copy of the regex or reset lastIndex because of 'g' flag
  headingRe.lastIndex = 0;
  while ((match = headingRe.exec(content)) !== null) {
    matches.push({ pos: match.index, version: match[1] });
  }

  if (matches.length === 0) {
    return content;
  }

  const parseMinor = (ver: string): string | null => {
    const parts = ver.split(".");
    if (parts.length < 2) return null;
    return `${parts[0]}.${parts[1]}`;
  };

  const currentMinor = parseMinor(currentVersion);
  let previousMinor: string | null = null;
  let cutPosition: number | null = null;

  for (const item of matches) {
    const verMinor = parseMinor(item.version);

    if (verMinor === currentMinor) {
      continue;
    }

    if (previousMinor === null) {
      previousMinor = verMinor;
      continue;
    }

    if (verMinor !== previousMinor) {
      cutPosition = item.pos;
      break;
    }
  }

  // Fallback if we have many versions but couldn't find a cut point via minor versions
  if (cutPosition === null && matches.length > 5) {
    cutPosition = matches[5].pos;
  }

  if (cutPosition !== null) {
    const truncated = content.slice(0, cutPosition).trimEnd();
    return `${truncated}\n---\n\n*[Earlier entries truncated by ai-fdocs]*\n`;
  }

  return content;
}
