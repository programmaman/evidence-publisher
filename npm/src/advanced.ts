export type {
    RequestAuth,
    RequestContext,
    RequestFieldValue,
    RequestFields,
    UploadRequest,
    PinByCidRequest,
    PinningRequest,
    Attachment,
    PublishedAttachment,
    PublishedEvidenceDocument,
    CidInput,
    PinResult,
    RemotePinningConfig,
    RemotePinOutcome,
    EvidenceDraft,
    EvidenceJson,
    EvidenceJsonDocument,
    EvidencePublishRequest,
    EvidencePublishResult,
    RulingOptionType,
    CourtEncodingVersion,
    RulingOptions,
    MetaEvidence,
    MetaEvidenceDraft,
    ManualMetaEvidencePublishRequest,
    AssistedMetaEvidencePublishRequest,
    MetaEvidencePublishRequest,
    MetaEvidencePublishResult,
} from './types.js';

export type { ContentPublishOptions, ContentAddResult, AttachmentStore, EvidenceStore, MetaEvidenceStore } from './storage-types.js';

export type {
    StorageConfig,
    StorageConfigReadOptions,
    AddressingModel,
    ProviderConfig,
    PinningConfig,
    ProviderAuth,
} from './config.js';

export {
    parseStorageConfig,
    readStorageConfigFile,
    normalizeStorageConfig,
    readEnvFile,
    EvidenceConfigError,
} from './config.js';

export { EvidencePublisher } from './EvidencePublisher.js';
export type { EvidencePublisherOptions } from './EvidencePublisher.js';

export { MetaEvidencePublisher } from './MetaEvidencePublisher.js';
export type { MetaEvidencePublisherOptions } from './MetaEvidencePublisher.js';

export { MetaEvidenceJsonBuilder } from './MetaEvidenceJsonBuilder.js';

export type {
    EvidencePublisherFactoryOptions,
    EvidencePublisherConfig,
    MetaEvidencePublisherFactoryOptions,
} from './EvidencePublisherFactory.js';
export { createHttpEvidencePublisher, createHttpMetaEvidencePublisher } from './EvidencePublisherFactory.js';

export { HttpMultipartUploadClient } from './http/HttpMultipartUploadClient.js';
export type { HttpMultipartUploadClientOptions, HttpMultipartUploadInput } from './http/HttpMultipartUploadClient.js';

export { HttpPinByCidClient } from './http/HttpPinByCidClient.js';
export type { HttpPinByCidClientOptions, HttpPinByCidResult } from './http/HttpPinByCidClient.js';