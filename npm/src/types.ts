export type RequestAuth =
    | { type: 'none' }
    | { type: 'basic'; username: string; password: string }
    | { type: 'bearer'; token: string }
    | { type: 'header'; name: string; value: string };

/** Court-compatible ruling option types supported by Kleros Court. */
export type RulingOptionType =
    | 'single-select'
    | 'multiple-select'
    | 'uint'
    | 'int'
    | 'string'
    | 'datetime'
    | 'hash';

/** Modern iframe encoding mode used by Kleros Court. */
export type CourtEncodingVersion = '0' | '1';

/** Court-facing nested ruling options. */
export interface RulingOptions {
    type: RulingOptionType;
    precision: number;
    titles: string[];
    descriptions: string[];
    reserved: Record<string, string>;
}

/** Court-facing MetaEvidence document (ERC-1497). */
export interface MetaEvidence {
    // Required fields
    category: string;
    title: string;
    description: string;
    question: string;
    rulingOptions: RulingOptions;
    // Optional attachment fields
    fileURI?: string;
    fileHash?: string;
    fileTypeExtension?: string;
    // Optional party aliases
    aliases?: Record<string, string>;
    // Optional display interface
    evidenceDisplayInterfaceURI?: string;
    evidenceDisplayInterfaceHash?: string;
    dynamicScriptURI?: string;
    dynamicScriptHash?: string;
    // Optional chain / arbitration metadata
    arbitrableInterfaceURI?: string;
    arbitrableChainID?: number;
    arbitratorChainID?: number;
    arbitrableJsonRpcUrl?: string;
    arbitratorJsonRpcUrl?: string;
    /** Court encoding version. Defaults to '1' when omitted. */
    _v?: CourtEncodingVersion;
}

/**
 * Caller-supplied draft for building a MetaEvidence document.
 * Required fields match the ERC-1497 minimum; all other fields are optional.
 * File-related fields are supplied by the caller (manual path) or derived from
 * an uploaded attachment (assisted path).
 */
export interface MetaEvidenceDraft {
    category: string;
    title: string;
    description: string;
    question: string;
    rulingOptions: RulingOptions;
    aliases?: Record<string, string>;
    fileURI?: string;
    fileHash?: string;
    fileTypeExtension?: string;
    evidenceDisplayInterfaceURI?: string;
    evidenceDisplayInterfaceHash?: string;
    dynamicScriptURI?: string;
    dynamicScriptHash?: string;
    arbitrableInterfaceURI?: string;
    arbitrableChainID?: number;
    arbitratorChainID?: number;
    arbitrableJsonRpcUrl?: string;
    arbitratorJsonRpcUrl?: string;
    _v?: CourtEncodingVersion;
}

/**
 * Manual MetaEvidence publish — the caller provides all document fields,
 * including any file-related metadata.  No attachment upload is performed.
 */
export type ManualMetaEvidencePublishRequest = MetaEvidenceDraft;

/**
 * Assisted MetaEvidence publish — the caller provides the core draft plus a
 * binary attachment.  The SDK uploads the attachment first and fills
 * `fileURI`, `fileHash`, and `fileTypeExtension` from the upload result.
 * Attachment-derived values take precedence over any file fields on the draft.
 */
export interface AssistedMetaEvidencePublishRequest extends MetaEvidenceDraft {
    attachment: Attachment;
}

/** Union of both MetaEvidence publish paths. */
export type MetaEvidencePublishRequest =
    | ManualMetaEvidencePublishRequest
    | AssistedMetaEvidencePublishRequest;

/** Result returned by {@link MetaEvidencePublisher.publish}. */
export interface MetaEvidencePublishResult {
    /** The canonical MetaEvidence JSON that was published. */
    documentJson: MetaEvidence;
    /** The published IPFS document location. */
    document: PublishedEvidenceDocument;
    /** Published attachment, present only when the assisted path was used. */
    attachment?: PublishedAttachment;
    /**
     * Remote pinning outcome.  Present only when `remotePinning` is configured
     * on the publisher.  Check `remotePinning.error` to detect persistence
     * failures without losing the publish result.
     */
    remotePinning?: RemotePinOutcome;
}

/**
 * Optional post-publish durability step.
 *
 * After any backend produces a CID, the SDK optionally forwards that CID to a
 * remote pinning service.  This is backend-agnostic: it works after Helia,
 * Kubo, Pinata upload, or any future backend that returns a CID.
 *
 * Remote pinning is distinct from local pinning (which is an internal Helia
 * implementation detail).
 */
export interface RemotePinningConfig {
    /** Base URL of the remote pinning service (e.g. https://api.pinata.cloud/v3). */
    endpoint: string;
    /** Authentication for the remote pinning service. */
    auth: RequestAuth;
    /** Path for the pin-by-CID endpoint relative to endpoint. Defaults to /files/public/pin_by_cid. */
    requestPath?: string;
    /** Additional headers for every remote pin request. */
    headers?: Record<string, string>;
    /**
     * Whether remote pinning is active.
     * Omit or set to true to enable; false to disable without removing the config block.
     */
    enabled?: boolean;
}

/**
 * Outcome of the remote pinning step embedded in {@link EvidencePublishResult}.
 * Present only when `remotePinning` is configured.
 */
export interface RemotePinOutcome {
    /** CID pin result for the evidence document. Present when pinning succeeded. */
    documentPin?: PinResult;
    /** CID pin result for the attachment. Present when an attachment was published and pinning succeeded. */
    attachmentPin?: PinResult;
    /**
     * Set when remote pinning failed.  The publish result is still returned — the
     * caller can inspect this field to distinguish publish success from persistence failure.
     */
    error?: Error;
}

export type RequestFieldValue = string | number | boolean | null | undefined | Record<string, string> | string[];

export type RequestFields = Record<string, RequestFieldValue>;

/** Minimal shared transport context: how to authenticate and any extra headers.
 *  `auth` is optional — when omitted, the client falls back to its own configured auth. */
export interface RequestContext {
    auth?: RequestAuth;
    headers?: Record<string, string>;
}

export interface UploadRequest extends RequestContext {
    file: Uint8Array;
    fileName?: string;
    mediaType?: string;
    /** Provider-specific extra form or body fields. */
    fields?: RequestFields;
}

export interface PinByCidRequest extends RequestContext {
    cid: string;
    /** Provider-specific extra JSON body fields included in the pin request. */
    fields?: RequestFields;
}

export type PinningRequest = UploadRequest | PinByCidRequest;

/** ERC-1497 Evidence JSON document. */
export interface EvidenceJson {
    title: string;
    name: string;
    description: string;
    fileURI?: string;
    fileHash?: string;
    fileTypeExtension?: string;
    selfHash?: string;
}

export type EvidenceJsonDocument = EvidenceJson;

export interface EvidenceDraft {
    title: string;
    description: string;
    fileUri?: string;
    fileHash?: string;
    fileTypeExtension?: string;
}

export interface Attachment {
    bytes: Uint8Array;
    fileName?: string;
    mediaType?: string;
    fileTypeExtension?: string;
}

export interface PublishedAttachment {
    cid: string;
    uri: string;
    fileHash?: string;
    fileTypeExtension?: string;
    mediaType?: string;
    sizeBytes?: number;
    gatewayUrls?: string[];
    metadata?: Record<string, string>;
}

export interface PublishedEvidenceDocument {
    cid: string;
    uri: string;
    gatewayUrls?: string[];
    metadata?: Record<string, string>;
}

export interface EvidencePublishRequest {
    title: string;
    description: string;
    attachment?: Attachment;
    fileUri?: string;
    fileHash?: string;
    fileTypeExtension?: string;
}

export interface EvidencePublishResult {
    selfHash: string;
    documentJson: EvidenceJsonDocument;
    attachment?: PublishedAttachment;
    document: PublishedEvidenceDocument;
    /**
     * Remote pinning outcome.  Present only when `remotePinning` is configured
     * on the publisher.  Check `remotePinning.error` to detect persistence
     * failures without losing the publish result.
     */
    remotePinning?: RemotePinOutcome;
}

/** CID input wrapper — kept as a type to allow validation in future. */
export interface CidInput {
    cid: string;
}

export interface PinResult {
    cid: string;
    uri?: string;
    gatewayUrls?: string[];
    metadata?: Record<string, string>;
}