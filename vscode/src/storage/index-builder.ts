import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const INDEX_FILE_NAME = '_INDEX.md';

export interface IndexEntry {
    name: string;
    version: string;
    isFallback?: boolean;
}

export function renderIndex(entries: IndexEntry[]): string {
    const sorted = [...entries].sort((a, b) => `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`));

    let content = '# AI Vendor Docs Index\n\n';
    if (sorted.length === 0) {
        content += 'No packages were synced.\n';
        return content;
    }

    for (const entry of sorted) {
        const suffix = entry.isFallback ? ' ⚠️ fallback' : '';
        const dir = `${entry.name}@${entry.version}`;
        content += `- [${entry.name}@${entry.version}](${dir}/_SUMMARY.md)${suffix}\n`;
    }

    return content;
}

export function writeIndex(rootDir: string, entries: IndexEntry[]): void {
    mkdirSync(rootDir, { recursive: true });
    writeFileSync(join(rootDir, INDEX_FILE_NAME), renderIndex(entries), 'utf-8');
}
