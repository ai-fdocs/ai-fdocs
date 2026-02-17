export function serializeReport(report: unknown): string {
    return JSON.stringify(report, null, 2);
}
