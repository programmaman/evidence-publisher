import { readFile } from 'node:fs/promises';
import { parse as parseDotEnv } from 'dotenv';
import { parse as parseYaml } from 'yaml';
import type { RequestAuth, RemotePinningConfig } from './types.js';

export type AddressingModel = 'content' | 'location';
export type ProviderAuth = RequestAuth;

export interface ProviderConfig {
    /** Semantic identifier for logs/debugging. */
    name: string;
    /** Target endpoint when there is one. */
    url?: string;
    /** Thin overridable auth strategy. */
    auth: RequestAuth;
    /**
     * Provider-specific extra fields sent with every multipart upload request.
     * Example: `{ network: "public" }` for Pinata v3.
     */
    fields?: Record<string, string>;
    /**
     * Extra HTTP headers applied to every upload request.
     * Merged before per-request headers; per-request headers take precedence.
     */
    headers?: Record<string, string>;
    /**
     * Multipart field name for the file blob.
     * Defaults to "file" when not set.
     */
    fileFieldName?: string;
}

export interface PinningConfig {
    /** Whether the published content should be kept durable/pinned. */
    enabled: boolean;
}

export interface StorageConfig {
    addressing: AddressingModel;
    provider: ProviderConfig;
    pinning: PinningConfig;
    /** Optional remote pinning config loaded from the YAML `remotePinning` section. */
    remotePinning?: RemotePinningConfig;
}

export interface StorageConfigReadOptions {
    /** Explicit environment map used to resolve placeholders. Defaults to process.env. */
    env?: NodeJS.ProcessEnv;
    /** Optional `.env` file loaded before resolving placeholders. */
    envFilePath?: string;
}

export class EvidenceConfigError extends Error {
    constructor(message: string, public readonly source: string) {
        super(`${message} (${source})`);
        this.name = 'EvidenceConfigError';
    }
}

export async function readEnvFile(filePath: string): Promise<Record<string, string>> {
    const raw = await readFile(filePath, 'utf8');
    return parseDotEnv(raw);
}

export async function readStorageConfigFile(filePath: string, options: StorageConfigReadOptions = {}): Promise<StorageConfig> {
    const raw = await readFile(filePath, 'utf8');
    const env = await loadConfigEnvironment(options.env, options.envFilePath);
    return parseStorageConfig(raw, env, filePath);
}

export function parseStorageConfig(
    raw: string,
    env: NodeJS.ProcessEnv = process.env,
    source = '(inline config)',
): StorageConfig {
    let parsed: unknown;
    try {
        parsed = parseYaml(raw);
    } catch (cause) {
        throw new EvidenceConfigError(`Failed to parse YAML config: ${(cause as Error).message}`, source);
    }

    const resolved = resolveEnvironmentValues(parsed, toEnvRecord(env), source);
    return normalizeStorageConfig(resolved, source);
}

export function normalizeStorageConfig(value: unknown, source = '(inline config)'): StorageConfig {
    const record = asRecord(value, source, 'config');

    const addressing = normalizeAddressing(record.addressing, source);
    const provider = normalizeProvider(record.provider, addressing, source);
    const pinning = normalizePinning(record.pinning, addressing, source);
    const remotePinning = normalizeRemotePinning(record.remotePinning, source);

    return {
        addressing,
        provider,
        pinning,
        ...(remotePinning ? { remotePinning } : {}),
    };
}

function normalizeAddressing(value: unknown, source: string): AddressingModel {
    const addressing = readString(value, source, 'addressing');
    if (addressing !== 'content' && addressing !== 'location') {
        throw new EvidenceConfigError(`addressing must be 'content' or 'location'`, source);
    }
    return addressing;
}

function normalizeProvider(value: unknown, addressing: AddressingModel, source: string): ProviderConfig {
    const record = asRecord(value, source, 'provider');
    const name = readString(record.name, source, 'provider.name');
    const url = optionalString(record.url, source, 'provider.url');
    const auth = normalizeAuth(record.auth, source, 'provider.auth');
    const fields = normalizeStringMap(record.fields, source, 'provider.fields');
    const headers = normalizeStringMap(record.headers, source, 'provider.headers');
    const fileFieldName = optionalString(record.fileFieldName, source, 'provider.fileFieldName');

    if (addressing === 'location' && !url) {
        throw new EvidenceConfigError(`provider.url is required when addressing is 'location'`, source);
    }

    if (url) {
        validateUrl(url, source, 'provider.url');
    }

    return {
        name,
        ...(url ? { url } : {}),
        auth,
        ...(fields ? { fields } : {}),
        ...(headers ? { headers } : {}),
        ...(fileFieldName ? { fileFieldName } : {}),
    };
}

function normalizeAuth(value: unknown, source: string, fieldPath = 'provider.auth'): ProviderAuth {
    if (value === undefined || value === null) {
        return { type: 'none' };
    }

    const record = asRecord(value, source, fieldPath);
    const type = readString(record.type, source, `${fieldPath}.type`);

    switch (type) {
        case 'none':
            return { type: 'none' };
        case 'basic': {
            const username = readString(record.username, source, `${fieldPath}.username`);
            const password = readString(record.password, source, `${fieldPath}.password`);
            return { type: 'basic', username, password };
        }
        case 'bearer': {
            const token = readString(record.token, source, `${fieldPath}.token`);
            return { type: 'bearer', token };
        }
        case 'header': {
            const name = readString(record.name, source, `${fieldPath}.name`);
            const value = readString(record.value, source, `${fieldPath}.value`);
            return { type: 'header', name, value };
        }
        default:
            throw new EvidenceConfigError(`${fieldPath}.type must be one of: none, basic, bearer, header`, source);
    }
}

function normalizePinning(value: unknown, addressing: AddressingModel, source: string): PinningConfig {
    if (value === undefined || value === null) {
        return {
            enabled: addressing === 'content',
        };
    }

    const record = asRecord(value, source, 'pinning');
    const enabled = readBoolean(record.enabled, source, 'pinning.enabled');

    return {
        enabled,
    };
}

function normalizeRemotePinning(value: unknown, source: string): RemotePinningConfig | undefined {
    if (value === undefined || value === null) {
        return undefined;
    }

    const record = asRecord(value, source, 'remotePinning');
    const endpoint = readString(record.endpoint, source, 'remotePinning.endpoint');
    validateUrl(endpoint, source, 'remotePinning.endpoint');
    const auth = normalizeAuth(record.auth, source, 'remotePinning.auth');
    const requestPath = optionalString(record.requestPath, source, 'remotePinning.requestPath');
    const headers = normalizeStringMap(record.headers, source, 'remotePinning.headers');

    let enabled: boolean | undefined;
    if (record.enabled !== undefined && record.enabled !== null) {
        enabled = readBoolean(record.enabled, source, 'remotePinning.enabled');
    }

    return {
        endpoint,
        auth,
        ...(requestPath ? { requestPath } : {}),
        ...(headers ? { headers } : {}),
        ...(enabled !== undefined ? { enabled } : {}),
    };
}

function normalizeStringMap(
    value: unknown,
    source: string,
    field: string,
): Record<string, string> | undefined {
    if (value === undefined || value === null) {
        return undefined;
    }
    const record = asRecord(value, source, field);
    const result: Record<string, string> = {};
    for (const [key, item] of Object.entries(record)) {
        if (typeof item !== 'string') {
            throw new EvidenceConfigError(`${field}.${key} must be a string`, source);
        }
        result[key] = item;
    }
    return result;
}

async function loadConfigEnvironment(env?: NodeJS.ProcessEnv, envFilePath?: string): Promise<Record<string, string>> {
    const fromFile = envFilePath ? await readEnvFileIfPresent(envFilePath) : {};
    const fromProcess = toEnvRecord(process.env);
    const fromOptions = toEnvRecord(env ?? process.env);

    return {
        ...fromFile,
        ...fromProcess,
        ...fromOptions,
    };
}

async function readEnvFileIfPresent(filePath: string): Promise<Record<string, string>> {
    try {
        return await readEnvFile(filePath);
    } catch (error) {
        if (isMissingFileError(error)) {
            return {};
        }

        throw error;
    }
}

function resolveEnvironmentValues(value: unknown, env: Record<string, string>, source: string, path = 'config'): unknown {
    if (typeof value === 'string') {
        return resolveEnvPlaceholders(value, env, source, path);
    }

    if (Array.isArray(value)) {
        return value.map((item, index) => resolveEnvironmentValues(item, env, source, `${path}[${index}]`));
    }

    if (typeof value === 'object' && value !== null) {
        const resolved: Record<string, unknown> = {};
        for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
            resolved[key] = resolveEnvironmentValues(item, env, source, `${path}.${key}`);
        }
        return resolved;
    }

    return value;
}

function resolveEnvPlaceholders(value: string, env: Record<string, string>, source: string, path: string): string {
    const placeholderPattern = /\$\{([^}]+)}/g;
    return value.replace(placeholderPattern, (_match, rawName: string) => {
        const name = rawName.trim();
        const resolved = env[name];
        if (resolved === undefined || resolved.trim() === '') {
            throw new EvidenceConfigError(`Environment variable ${name} referenced by ${path} was not found or was blank`, source);
        }
        return resolved;
    });
}

function validateUrl(url: string, source: string, field: string): void {
    try {
        // Ensure the URL is syntactically valid, but do not constrain protocol.
         
        new URL(url);
    } catch {
        throw new EvidenceConfigError(`${field} must be a valid absolute URL`, source);
    }
}

function asRecord(value: unknown, source: string, field: string): Record<string, unknown> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new EvidenceConfigError(`${field} must be an object`, source);
    }
    return value as Record<string, unknown>;
}

function readString(value: unknown, source: string, field: string): string {
    if (typeof value !== 'string') {
        throw new EvidenceConfigError(`${field} must be a string`, source);
    }
    if (value.trim() === '') {
        throw new EvidenceConfigError(`${field} must not be blank`, source);
    }
    return value;
}

function optionalString(value: unknown, source: string, field: string): string | undefined {
    if (value === undefined || value === null) return undefined;
    return readString(value, source, field);
}

function readBoolean(value: unknown, source: string, field: string): boolean {
    if (typeof value !== 'boolean') {
        throw new EvidenceConfigError(`${field} must be a boolean`, source);
    }
    return value;
}


function toEnvRecord(env: NodeJS.ProcessEnv): Record<string, string> {
    const record: Record<string, string> = {};
    for (const [key, value] of Object.entries(env)) {
        if (typeof value === 'string' && value.length > 0) {
            record[key] = value;
        }
    }
    return record;
}

function isMissingFileError(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'ENOENT';
}