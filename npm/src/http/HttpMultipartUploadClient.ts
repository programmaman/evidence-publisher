import { buildGatewayUrls } from '../helia/HeliaIpfsClient.js';
import type { RequestAuth, RequestContext, RequestFieldValue, RequestFields, UploadRequest } from '../types.js';
import type { ContentAddResult } from '../storage-types.js';

export type HttpMultipartUploadInput = Partial<Omit<UploadRequest, 'file'>> & { file: Uint8Array };

export interface HttpMultipartUploadClientOptions<RequestModel = UploadRequest> extends Partial<RequestContext> {
    providerUrl?: string;
    gatewayBaseUrls?: string[];
    /** Upload endpoint path relative to provider.url. Defaults to /files. */
    requestPath?: string;
    /** Multipart field name expected by the provider. Defaults to file. */
    fileFieldName?: string;
    /** Client-level default provider-specific fields, merged with per-request fields. */
    fields?: RequestFields;
    /** Candidate JSON field names used to extract a CID from the response. */
    responseCidFields?: string[];
    /** Build a typed request model before serialization. Defaults to the UploadRequest itself. */
    buildRequestModel?: (input: UploadRequest) => RequestModel;
    /** Serialize the request model to the wire body. Defaults to multipart/form-data. */
    serializeRequestModel?: (request: RequestModel) => BodyInit;
    /** Parse a CID out of the response model. */
    parseResponse?: (responseBody: unknown) => string | undefined;
}

export class HttpMultipartUploadClient<RequestModel = UploadRequest> {
    private readonly apiEndpoint: string;

    constructor(private readonly options: HttpMultipartUploadClientOptions<RequestModel>) {
        const apiEndpoint = options.providerUrl?.trim();
        if (!apiEndpoint && !options.requestPath) {
            throw new Error('HttpMultipartUploadClient requires providerUrl or requestPath');
        }
        this.apiEndpoint = apiEndpoint ?? '';
    }

    async upload(request: UploadRequest): Promise<ContentAddResult> {
        return this.publish(request);
    }

    async addBytes(bytes: Uint8Array, input: Omit<HttpMultipartUploadInput, 'file'> = {}): Promise<ContentAddResult> {
        const request: UploadRequest = {
            auth: input.auth ?? this.options.auth ?? { type: 'none' },
            headers: this.mergeHeaders(input.headers),
            fields: this.mergeFields(input.fields),
            file: bytes,
            fileName: input.fileName,
            mediaType: input.mediaType,
        };

        return this.publish(request);
    }

    private async publish(request: UploadRequest): Promise<ContentAddResult> {
        const model: RequestModel = this.options.buildRequestModel ? this.options.buildRequestModel(request) : (request as RequestModel);
        const response = await fetch(this.buildRequestUrl(), {
            method: 'POST',
            headers: this.buildHeaders(request),
            body: this.options.serializeRequestModel ? this.options.serializeRequestModel(model) : this.buildDefaultFormData(request),
        });

        const responseText = await response.text();
        if (!response.ok) {
            throw new Error(`HTTP multipart upload failed with status ${response.status} ${response.statusText}: ${responseText || '(empty response)'}`);
        }

        const cid = this.options.parseResponse?.(parseJsonIfPossible(responseText)) ?? extractCid(responseText, this.options.responseCidFields);
        if (!cid) {
            throw new Error('HTTP multipart upload succeeded but no CID was returned');
        }

        return {
            cid,
            uri: `ipfs://${cid}`,
            gatewayUrls: buildGatewayUrls(cid, this.options.gatewayBaseUrls),
        };
    }

    private buildRequestUrl(): string {
        return this.apiEndpoint ? appendPathSegment(this.apiEndpoint, this.options.requestPath ?? '') : (this.options.requestPath ?? '');
    }

    private buildHeaders(request: UploadRequest): Headers {
        const headers = new Headers();
        applyAuthHeader(headers, request.auth ?? this.options.auth ?? { type: 'none' });

        for (const source of [this.options.headers, request.headers]) {
            for (const [name, value] of Object.entries(source ?? {})) {
                if (value !== undefined && value !== null) {
                    headers.set(name, value);
                }
            }
        }

        return headers;
    }

    private buildDefaultFormData(request: UploadRequest): FormData {
        const fieldName = this.options.fileFieldName ?? 'file';
        const fileName = request.fileName?.trim() || 'evidence.bin';
        const mediaType = request.mediaType?.trim() || 'application/octet-stream';
        const blobPart: ArrayBuffer = (request.file.byteOffset === 0 && request.file.byteLength === request.file.buffer.byteLength
            ? request.file.buffer
            : request.file.buffer.slice(request.file.byteOffset, request.file.byteOffset + request.file.byteLength)) as ArrayBuffer;

        const form = new FormData();
        form.append(fieldName, new Blob([blobPart], { type: mediaType }), fileName);

        for (const [name, value] of Object.entries(request.fields ?? {})) {
            appendFieldValue(form, name, value);
        }

        return form;
    }

    private mergeHeaders(headers?: Record<string, string>): Record<string, string> {
        return { ...(this.options.headers ?? {}), ...(headers ?? {}) };
    }

    private mergeFields(fields?: RequestFields): RequestFields {
        return { ...(this.options.fields ?? {}), ...(fields ?? {}) };
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
        const record = payload as Record<string, unknown>;
        const nested = asRecord(record.data) ?? record;

        for (const field of candidates) {
            const value = nested[field];
            if (typeof value === 'string' && value.trim()) {
                return value.trim();
            }
        }
    }

    return undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return undefined;
    }

    return value as Record<string, unknown>;
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

function appendFieldValue(form: FormData, name: string, value: unknown): void {
    if (value === undefined || value === null) {
        return;
    }

    if (typeof value === 'string') {
        form.append(name, value);
        return;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
        form.append(name, String(value));
        return;
    }

    form.append(name, JSON.stringify(value));
}

function applyAuthHeader(headers: Headers, auth: RequestAuth): void {
    switch (auth.type) {
        case 'none':
            return;
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