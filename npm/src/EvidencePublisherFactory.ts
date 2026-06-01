import { join } from 'node:path';
import { readStorageConfigFile, type StorageConfig, type StorageConfigReadOptions } from './config.js';
import { EvidenceHasher } from './EvidenceHasher.js';
import { EvidencePublisher } from './EvidencePublisher.js';
import { MetaEvidencePublisher } from './MetaEvidencePublisher.js';
import { HeliaAttachmentStore } from './helia/HeliaAttachmentStore.js';
import { HeliaEvidenceStore } from './helia/HeliaEvidenceStore.js';
import { HeliaIpfsClient } from './helia/HeliaIpfsClient.js';
import { HttpMultipartUploadClient } from './http/HttpMultipartUploadClient.js';
import { HttpPinByCidClient } from './http/HttpPinByCidClient.js';
import type { AttachmentStore, ContentAddResult, EvidenceStore, MetaEvidenceStore } from './storage-types.js';
import type {
    Attachment,
    EvidenceJsonDocument,
    MetaEvidence,
    PublishedAttachment,
    PublishedEvidenceDocument,
    RemotePinningConfig,
    RequestAuth,
    RequestFields,
    UploadRequest,
} from './types.js';

// ─── Legacy file-based factory ───────────────────────────────────────────────

export interface EvidencePublisherFactoryOptions extends StorageConfigReadOptions {
    /**
     * Explicit config supplied by code. When present, file reads are bypassed.
     */
    config?: StorageConfig;
    /** Optional YAML file path used only when `config` is not supplied. */
    configFilePath?: string;
    gatewayBaseUrls?: string[];
    attachmentStore?: AttachmentStore;
    documentStore?: EvidenceStore;
}

export async function createEvidencePublisher(options: EvidencePublisherFactoryOptions = {}): Promise<EvidencePublisher> {
    const { config, configFilePath, gatewayBaseUrls, attachmentStore, documentStore, ...readOptions } = options;
    const resolvedConfig = await resolveConfig(config, configFilePath, readOptions);

    // ── content addressing: auto-dispatch on whether a provider URL is present ──
    if (resolvedConfig.addressing === 'content') {
        if (!resolvedConfig.provider.url) {
            // No URL → in-process Helia node
            const heliaClient = new HeliaIpfsClient({
                provider: resolvedConfig.provider,
                gatewayBaseUrls,
            });
            return new EvidencePublisher({
                attachmentStore: attachmentStore ?? new HeliaAttachmentStore(heliaClient),
                documentStore: documentStore ?? new HeliaEvidenceStore(heliaClient),
                onClose: () => heliaClient.stop(),
                ...(resolvedConfig.remotePinning ? { remotePinning: resolvedConfig.remotePinning } : {}),
            });
        }

        // URL present → HTTP multipart upload (Pinata, Kubo, or any compatible provider)
        const uploadClient = new HttpMultipartUploadClient({
            providerUrl: resolvedConfig.provider.url,
            auth: resolvedConfig.provider.auth,
            ...(resolvedConfig.provider.headers ? { headers: resolvedConfig.provider.headers } : {}),
            ...(resolvedConfig.provider.fields ? { fields: resolvedConfig.provider.fields } : {}),
            ...(resolvedConfig.provider.fileFieldName ? { fileFieldName: resolvedConfig.provider.fileFieldName } : {}),
            gatewayBaseUrls,
        });
        return new EvidencePublisher({
            attachmentStore: attachmentStore ?? new MultipartAttachmentStore(uploadClient),
            documentStore: documentStore ?? new MultipartEvidenceStore(uploadClient),
            ...(resolvedConfig.remotePinning ? { remotePinning: resolvedConfig.remotePinning } : {}),
        });
    }

    // ── location addressing: requires caller-supplied stores ──────────────────
    if (!documentStore) {
        throw new Error(
            'location addressing requires a custom documentStore to be supplied'
        );
    }
    return new EvidencePublisher({
        ...(attachmentStore ? { attachmentStore } : {}),
        documentStore,
        ...(resolvedConfig.remotePinning ? { remotePinning: resolvedConfig.remotePinning } : {}),
    });
}

async function resolveConfig(
    config: StorageConfig | undefined,
    configFilePath: string | undefined,
    readOptions: StorageConfigReadOptions,
): Promise<StorageConfig> {
    const envFilePath = readOptions.envFilePath ?? join(process.cwd(), '.env');

    if (config) {
        return config;
    }

    if (!configFilePath) {
        return readStorageConfigFile(join(process.cwd(), 'evidence.storage.yml'), {
            env: readOptions.env,
            envFilePath,
        });
    }

    return readStorageConfigFile(configFilePath, {
        env: readOptions.env,
        envFilePath,
    });
}

// ─── HTTP endpoint-driven factory ────────────────────────────────────────────

/**
 * Simple, synchronous configuration for publishers that store evidence via an
 * HTTP multipart upload endpoint (Kubo, Pinata v3, or any compatible service).
 */
export interface EvidencePublisherConfig {
    /** Base URL of the upload endpoint (e.g. https://uploads.pinata.cloud/v3). */
    endpoint: string;
    /** Authentication strategy. */
    auth: RequestAuth;
    /** Extra request headers applied to every upload. */
    headers?: Record<string, string>;
    /** Path relative to endpoint for uploads. Defaults to /files. */
    requestPath?: string;
    /** Multipart field name for the file blob. Defaults to "file". */
    fileFieldName?: string;
    /** Provider-specific extra fields sent with every upload request. */
    fields?: RequestFields;
    /** IPFS gateway base URLs used to build gateway links in results. */
    gatewayBaseUrls?: string[];
    /** Override the serialization of the upload request. */
    serializeRequest?: (request: UploadRequest) => BodyInit;
    /** Override CID extraction from the upload response. */
    parseResponse?: (responseBody: unknown) => string | undefined;
    /**
     * Base URL for pin-by-CID requests. When set, enables {@link EvidencePublisher.pinCid}.
     * For Pinata v3 this is https://api.pinata.cloud/v3 (path defaults to /files/public/pin_by_cid).
     */
    pinByCidEndpoint?: string;
    /** Request path for pin-by-CID relative to pinByCidEndpoint. Defaults to /files/public/pin_by_cid. */
    pinByCidRequestPath?: string;
    /**
     * Optional remote pinning step applied automatically after every publish.
     * Works across all upload backends — the produced CID is forwarded to the
     * configured remote pinning service.
     */
    remotePinning?: RemotePinningConfig;
}

/**
 * Create an {@link EvidencePublisher} backed by an HTTP multipart upload endpoint.
 * No file reads or async setup required — suitable for browser or edge environments.
 */
export function createHttpEvidencePublisher(config: EvidencePublisherConfig): EvidencePublisher {
    const uploadClient = new HttpMultipartUploadClient({
        providerUrl: config.endpoint,
        auth: config.auth,
        headers: config.headers,
        requestPath: config.requestPath,
        fileFieldName: config.fileFieldName,
        fields: config.fields,
        gatewayBaseUrls: config.gatewayBaseUrls,
        ...(config.serializeRequest ? { serializeRequestModel: config.serializeRequest } : {}),
        ...(config.parseResponse ? { parseResponse: config.parseResponse } : {}),
    });

    const pinByCidClient = config.pinByCidEndpoint
        ? new HttpPinByCidClient({
            providerUrl: config.pinByCidEndpoint,
            auth: config.auth,
            headers: config.headers,
            requestPath: config.pinByCidRequestPath,
        })
        : undefined;

    return new EvidencePublisher({
        attachmentStore: new MultipartAttachmentStore(uploadClient),
        documentStore: new MultipartEvidenceStore(uploadClient),
        ...(pinByCidClient ? { pinByCidClient } : {}),
        ...(config.remotePinning ? { remotePinning: config.remotePinning } : {}),
    });
}

// ─── MetaEvidence publisher factories ────────────────────────────────────────

export interface MetaEvidencePublisherFactoryOptions extends StorageConfigReadOptions {
    /** Explicit config supplied by code. When present, file reads are bypassed. */
    config?: StorageConfig;
    /** Optional YAML file path used only when `config` is not supplied. */
    configFilePath?: string;
    gatewayBaseUrls?: string[];
    attachmentStore?: AttachmentStore;
    documentStore?: MetaEvidenceStore;
}

/**
 * Create a {@link MetaEvidencePublisher} using the same config-file / Helia
 * resolution rules as {@link createEvidencePublisher}.
 */
export async function createMetaEvidencePublisher(
    options: MetaEvidencePublisherFactoryOptions = {},
): Promise<MetaEvidencePublisher> {
    const { config, configFilePath, gatewayBaseUrls, attachmentStore, documentStore, ...readOptions } = options;
    const resolvedConfig = await resolveConfig(config, configFilePath, readOptions);

    if (resolvedConfig.addressing === 'content') {
        if (!resolvedConfig.provider.url) {
            const heliaClient = new HeliaIpfsClient({
                provider: resolvedConfig.provider,
                gatewayBaseUrls,
            });
            return new MetaEvidencePublisher({
                attachmentStore: attachmentStore ?? new HeliaAttachmentStore(heliaClient),
                documentStore: documentStore ?? new HeliaMetaEvidenceStore(heliaClient),
                onClose: () => heliaClient.stop(),
                ...(resolvedConfig.remotePinning ? { remotePinning: resolvedConfig.remotePinning } : {}),
            });
        }

        const uploadClient = new HttpMultipartUploadClient({
            providerUrl: resolvedConfig.provider.url,
            auth: resolvedConfig.provider.auth,
            ...(resolvedConfig.provider.headers ? { headers: resolvedConfig.provider.headers } : {}),
            ...(resolvedConfig.provider.fields ? { fields: resolvedConfig.provider.fields } : {}),
            ...(resolvedConfig.provider.fileFieldName ? { fileFieldName: resolvedConfig.provider.fileFieldName } : {}),
            gatewayBaseUrls,
        });
        return new MetaEvidencePublisher({
            attachmentStore: attachmentStore ?? new MultipartAttachmentStore(uploadClient),
            documentStore: documentStore ?? new MultipartMetaEvidenceStore(uploadClient),
            ...(resolvedConfig.remotePinning ? { remotePinning: resolvedConfig.remotePinning } : {}),
        });
    }

    if (!documentStore) {
        throw new Error('location addressing requires a custom documentStore to be supplied');
    }
    return new MetaEvidencePublisher({
        ...(attachmentStore ? { attachmentStore } : {}),
        documentStore,
        ...(resolvedConfig.remotePinning ? { remotePinning: resolvedConfig.remotePinning } : {}),
    });
}

/**
 * Create a {@link MetaEvidencePublisher} backed by an HTTP multipart upload
 * endpoint. No file reads or async setup required — suitable for browser or
 * edge environments.
 *
 * Accepts the same {@link EvidencePublisherConfig} as
 * {@link createHttpEvidencePublisher} so callers can share a single config
 * object for both document types.
 */
export function createHttpMetaEvidencePublisher(config: EvidencePublisherConfig): MetaEvidencePublisher {
    const uploadClient = new HttpMultipartUploadClient({
        providerUrl: config.endpoint,
        auth: config.auth,
        headers: config.headers,
        requestPath: config.requestPath,
        fileFieldName: config.fileFieldName,
        fields: config.fields,
        gatewayBaseUrls: config.gatewayBaseUrls,
        ...(config.serializeRequest ? { serializeRequestModel: config.serializeRequest } : {}),
        ...(config.parseResponse ? { parseResponse: config.parseResponse } : {}),
    });

    const pinByCidClient = config.pinByCidEndpoint
        ? new HttpPinByCidClient({
            providerUrl: config.pinByCidEndpoint,
            auth: config.auth,
            headers: config.headers,
            requestPath: config.pinByCidRequestPath,
        })
        : undefined;

    return new MetaEvidencePublisher({
        attachmentStore: new MultipartAttachmentStore(uploadClient),
        documentStore: new MultipartMetaEvidenceStore(uploadClient),
        ...(pinByCidClient ? { pinByCidClient } : {}),
        ...(config.remotePinning ? { remotePinning: config.remotePinning } : {}),
    });
}

// ─── Internal store adapters ─────────────────────────────────────────────────

class MultipartAttachmentStore implements AttachmentStore {
    constructor(private readonly client: HttpMultipartUploadClient) {}

    async putAttachment(input: Attachment): Promise<PublishedAttachment> {
        const added: ContentAddResult = await this.client.addBytes(input.bytes, {
            fileName: input.fileName,
            mediaType: input.mediaType,
        });

        return {
            cid: added.cid,
            uri: added.uri,
            fileHash: EvidenceHasher.hashBytes(input.bytes),
            fileTypeExtension: input.fileTypeExtension,
            mediaType: input.mediaType,
            sizeBytes: input.bytes.length,
            gatewayUrls: added.gatewayUrls,
        };
    }
}

class MultipartEvidenceStore implements EvidenceStore {
    constructor(private readonly client: HttpMultipartUploadClient) {}

    async putEvidenceDocument(document: EvidenceJsonDocument): Promise<PublishedEvidenceDocument> {
        const added: ContentAddResult = await this.client.addBytes(EvidenceHasher.serialize(document), {
            fileName: 'evidence.json',
            mediaType: 'application/json',
        });

        return {
            cid: added.cid,
            uri: added.uri,
            gatewayUrls: added.gatewayUrls,
        };
    }
}

class MultipartMetaEvidenceStore implements MetaEvidenceStore {
    constructor(private readonly client: HttpMultipartUploadClient) {}

    async putMetaEvidenceDocument(document: MetaEvidence): Promise<PublishedEvidenceDocument> {
        const bytes = new TextEncoder().encode(JSON.stringify(document));
        const added: ContentAddResult = await this.client.addBytes(bytes, {
            fileName: 'metaEvidence.json',
            mediaType: 'application/json',
        });
        return {
            cid: added.cid,
            uri: added.uri,
            gatewayUrls: added.gatewayUrls,
        };
    }
}

class HeliaMetaEvidenceStore implements MetaEvidenceStore {
    constructor(private readonly client: HeliaIpfsClient) {}

    async putMetaEvidenceDocument(document: MetaEvidence): Promise<PublishedEvidenceDocument> {
        const bytes = new TextEncoder().encode(JSON.stringify(document));
        const added = await this.client.addBytes(bytes);
        return {
            cid: added.cid,
            uri: added.uri,
            gatewayUrls: added.gatewayUrls,
        };
    }
}