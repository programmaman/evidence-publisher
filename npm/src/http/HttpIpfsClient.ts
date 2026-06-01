import { buildGatewayUrls } from '../helia/HeliaIpfsClient.js';
import type { ProviderAuth } from '../config.js';
import type { ContentAddResult, ContentPublishOptions } from '../storage-types.js';

export interface HttpIpfsClientOptions extends ContentPublishOptions {
    /** Upload endpoint path relative to provider.url. Defaults to /api/v0/add. */
    uploadPath?: string;
    /** Multipart field name expected by the provider. Defaults to file. */
    uploadFieldName?: string;
    /** Additional request headers merged into the upload request. */
    requestHeaders?: Record<string, string>;
    /** Candidate JSON field names used to extract a CID from the response. */
    responseCidFields?: string[];
}

export interface HttpIpfsUploadInput {
    fileName?: string;
    mediaType?: string;
}

export class HttpIpfsClient {
    private readonly apiEndpoint: string;

    constructor(private readonly options: HttpIpfsClientOptions) {
        const apiEndpoint = options.provider?.url?.trim();
        if (!apiEndpoint) {
            throw new Error('HttpIpfsClient requires provider.url');
        }
        this.apiEndpoint = apiEndpoint;
    }

    async addBytes(bytes: Uint8Array, input: HttpIpfsUploadInput = {}): Promise<ContentAddResult> {
        const response = await fetch(this.buildUploadUrl(), {
            method: 'POST',
            headers: this.buildHeaders(),
            body: this.buildFormData(bytes, input),
        });

        const responseBody = await response.text();
        if (!response.ok) {
            throw new Error(`HTTP IPFS upload failed with status ${response.status} ${response.statusText}: ${responseBody || '(empty response)'}`);
        }

        const cid = extractCid(responseBody, this.options.responseCidFields);
        if (!cid) {
            throw new Error('HTTP IPFS upload succeeded but no CID was returned');
        }

        return {
            cid,
            uri: `ipfs://${cid}`,
            gatewayUrls: buildGatewayUrls(cid, this.options.gatewayBaseUrls),
        };
    }

    private buildUploadUrl(): string {
        return appendPathSegment(this.apiEndpoint, this.options.uploadPath ?? '/api/v0/add');
    }

    private buildFormData(bytes: Uint8Array, input: HttpIpfsUploadInput): FormData {
        const fieldName = this.options.uploadFieldName ?? 'file';
        const fileName = input.fileName?.trim() || 'evidence.bin';
        const mediaType = input.mediaType?.trim() || 'application/octet-stream';
        const blobPart: ArrayBuffer = (bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
            ? bytes.buffer
            : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)) as ArrayBuffer;

        const form = new FormData();
        form.append(fieldName, new Blob([blobPart], { type: mediaType }), fileName);
        return form;
    }

    private buildHeaders(): Headers {
        const headers = new Headers();
        applyAuthHeader(headers, this.options.provider?.auth);

        for (const [name, value] of Object.entries(this.options.requestHeaders ?? {})) {
            if (value !== undefined && value !== null) {
                headers.set(name, value);
            }
        }

        return headers;
    }
}

function extractCid(responseBody: string, responseCidFields: string[] | undefined): string | undefined {
    const trimmed = responseBody.trim();
    if (!trimmed) {
        return undefined;
    }

    const candidates = responseCidFields && responseCidFields.length > 0
        ? responseCidFields
        : ['Hash', 'IpfsHash', 'cid', 'CID', 'Cid'];

    let payload: unknown = trimmed;
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
        try {
            payload = JSON.parse(trimmed) as unknown;
        } catch {
            payload = trimmed;
        }
    }

    if (typeof payload === 'string') {
        return payload.trim() || undefined;
    }

    if (typeof payload === 'object' && payload !== null) {
        for (const field of candidates) {
            const value = (payload as Record<string, unknown>)[field];
            if (typeof value === 'string' && value.trim()) {
                return value.trim();
            }
        }
    }

    return undefined;
}

function applyAuthHeader(headers: Headers, auth?: ProviderAuth): void {
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