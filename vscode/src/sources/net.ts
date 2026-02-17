import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';
import { RequestErrorKind } from './source-types';

const DEFAULT_RETRY_STATUSES = [408, 425, 429, 500, 502, 503, 504];

export interface RetryOptions {
    attempts?: number;
    baseDelayMs?: number;
    retryOnStatuses?: number[];
}

export interface HttpResponse {
    status: number;
    headers: http.IncomingHttpHeaders;
    body: string;
    url: string;
}

export class SourceRequestError extends Error {
    constructor(
        message: string,
        public readonly kind: RequestErrorKind,
        public readonly status?: number
    ) {
        super(message);
        this.name = 'SourceRequestError';
    }
}

export function classifyHttpError(status: number): RequestErrorKind {
    if (status === 401 || status === 403) return 'auth';
    if (status === 404) return 'not_found';
    if (status === 429) return 'rate_limit';
    if (status >= 500) return 'server';
    return 'unknown';
}

function isRetryableStatus(status: number, retryOnStatuses: number[]): boolean {
    return retryOnStatuses.includes(status);
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function requestRaw(urlString: string, method: 'GET' | 'HEAD', redirects = 3): Promise<HttpResponse> {
    return new Promise((resolve, reject) => {
        const parsed = new URL(urlString);
        const client = parsed.protocol === 'http:' ? http : https;

        const req = client.request(
            parsed,
            {
                method,
                headers: {
                    'User-Agent': 'ai-fdocs-vscode',
                    Accept: 'application/json, text/plain, */*',
                },
            },
            res => {
                const status = res.statusCode ?? 0;
                const location = res.headers.location;

                if (status >= 300 && status < 400 && location && redirects > 0) {
                    const nextUrl = new URL(location, parsed).toString();
                    res.resume();
                    requestRaw(nextUrl, method, redirects - 1).then(resolve, reject);
                    return;
                }

                const chunks: Buffer[] = [];
                res.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
                res.on('end', () => {
                    resolve({
                        status,
                        headers: res.headers,
                        body: Buffer.concat(chunks).toString('utf8'),
                        url: parsed.toString(),
                    });
                });
            }
        );

        req.on('error', err => {
            reject(new SourceRequestError(`Network request failed for ${urlString}: ${err.message}`, 'network'));
        });

        req.setTimeout(30_000, () => {
            req.destroy(new Error('Request timeout'));
        });

        req.end();
    });
}

export async function requestWithRetry(
    url: string,
    method: 'GET' | 'HEAD' = 'GET',
    options: RetryOptions = {}
): Promise<HttpResponse> {
    const attempts = options.attempts ?? 3;
    const baseDelayMs = options.baseDelayMs ?? 250;
    const retryOnStatuses = options.retryOnStatuses ?? DEFAULT_RETRY_STATUSES;

    let lastError: unknown;

    for (let i = 0; i < attempts; i++) {
        try {
            const response = await requestRaw(url, method);
            const shouldRetry = isRetryableStatus(response.status, retryOnStatuses);
            if (!shouldRetry || i === attempts - 1) {
                return response;
            }
        } catch (error) {
            lastError = error;
            if (i === attempts - 1) {
                throw error;
            }
        }

        await sleep(baseDelayMs * 2 ** i);
    }

    throw new SourceRequestError(`Network request failed for ${url}: ${String(lastError)}`, 'network');
}

export async function requestJsonWithRetry<T>(url: string, options?: RetryOptions): Promise<T> {
    const response = await requestWithRetry(url, 'GET', options);

    if (response.status < 200 || response.status >= 300) {
        throw new SourceRequestError(
            `HTTP ${response.status} for ${url}`,
            classifyHttpError(response.status),
            response.status
        );
    }

    try {
        return JSON.parse(response.body) as T;
    } catch {
        throw new SourceRequestError(`Failed to parse JSON from ${url}`, 'parse', response.status);
    }
}
