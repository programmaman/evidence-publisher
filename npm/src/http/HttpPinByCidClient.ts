import type { RequestAuth, RequestContext, PinByCidRequest } from '../types.js';

export interface HttpPinByCidClientOptions extends Partial<RequestContext> {
    providerUrl?: string;
    gatewayBaseUrls?: string[];
    /** Pin-by-CID endpoint path relative to provider.url. Defaults to /files/public/pin_by_cid. */
    requestPath?: string;
}

export interface HttpPinByCidResult {
    status: number;
    responseText: string;
    responseBody: unknown;
    cid?: string;
    pinId?: string;
}

export class HttpPinByCidClient {
    private readonly apiEndpoint: string;

    constructor(private readonly options: HttpPinByCidClientOptions) {
        this.apiEndpoint = options.providerUrl?.trim() ?? '';
    }

    async pinByCid(input: PinByCidRequest): Promise<HttpPinByCidResult> {
        const cid = input.cid.trim();
        if (!cid) {
            throw new Error('HttpPinByCidClient requires input.cid');
        }

        const response = await fetch(this.buildRequestUrl(), {
            method: 'POST',
            headers: this.buildHeaders(input),
            body: JSON.stringify(this.buildRequestBody({ ...input, cid })),
        });

        const responseText = await response.text();
        if (!response.ok) {
            throw new Error(`HTTP pin-by-CID failed with status ${response.status} ${response.statusText}: ${responseText || '(empty response)'}`);
        }

        const responseBody = parseJsonIfPossible(responseText);
        const extracted = extractPinByCidMetadata(responseBody);

        return {
            status: response.status,
            responseText,
            responseBody,
            ...extracted,
        };
    }

    private buildRequestUrl(): string {
        return appendPathSegment(this.apiEndpoint, this.options.requestPath ?? '/files/public/pin_by_cid');
    }

    private buildRequestBody(input: PinByCidRequest): Record<string, unknown> {
        const body: Record<string, unknown> = {
            cid: input.cid,
        };

        for (const [name, value] of Object.entries(input.fields ?? {})) {
            body[name] = value;
        }

        return body;
    }

    private buildHeaders(input: PinByCidRequest): Headers {
        const headers = new Headers({
            'content-type': 'application/json',
        });

        applyAuthHeader(headers, input.auth ?? this.options.auth ?? { type: 'none' });

        for (const [name, value] of Object.entries(this.options.headers ?? {})) {
            if (value !== undefined && value !== null) {
                headers.set(name, value);
            }
        }

        for (const [name, value] of Object.entries(input.headers ?? {})) {
            if (value !== undefined && value !== null) {
                headers.set(name, value);
            }
        }

        return headers;
    }
}

function parseJsonIfPossible(value: string): unknown {
    const trimmed = value.trim();
    if (!trimmed) {
        return undefined;
    }

    try {
        return JSON.parse(trimmed) as unknown;
    } catch {
        return trimmed;
    }
}

function extractPinByCidMetadata(responseBody: unknown): { cid?: string; pinId?: string } {
    if (typeof responseBody !== 'object' || responseBody === null) {
        return {};
    }

    const root = responseBody as Record<string, unknown>;
    const data = asRecord(root.data) ?? root;
    return {
        cid: readStringField(data, ['cid', 'CID', 'content_cid']),
        pinId: readStringField(data, ['id', 'pinId', 'pin_id']),
    };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return undefined;
    }

    return value as Record<string, unknown>;
}

function readStringField(record: Record<string, unknown>, names: string[]): string | undefined {
    for (const name of names) {
        const value = record[name];
        if (typeof value === 'string' && value.trim()) {
            return value.trim();
        }
    }

    return undefined;
}

function applyAuthHeader(headers: Headers, auth?: RequestAuth): void {
    if (!auth || auth.type === 'none') {
        return;
    }

    switch (auth.type) {
        case 'basic': {
            const token = Buffer.from(`${auth.username}:${auth.password}`, 'utf8').toString('base64');
            headers.set('Authorization', `Basic ${token}`);
            return;
        }
        case 'bearer':
            headers.set('Authorization', `Bearer ${auth.token}`);
            return;
        case 'header':
            headers.set(auth.name, auth.value);
            return;
        default:
            return;
    }
}

function appendPathSegment(baseUrl: string, pathSegment: string): string {
    const base = baseUrl.trim();
    const segment = pathSegment.trim();

    if (!base) {
        return segment;
    }

    if (!segment) {
        return base;
    }

    const baseEndsWithSlash = base.endsWith('/');
    const segmentStartsWithSlash = segment.startsWith('/');

    if (baseEndsWithSlash && segmentStartsWithSlash) {
        return base + segment.slice(1);
    }

    if (!baseEndsWithSlash && !segmentStartsWithSlash) {
        return `${base}/${segment}`;
    }

    return base + segment;
}