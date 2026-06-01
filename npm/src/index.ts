// ─── Core public API ─────────────────────────────────────────────────────────
export type {
    RulingOptionType,
    CourtEncodingVersion,
    RulingOptions,
    MetaEvidence,
    MetaEvidenceDraft,
    ManualMetaEvidencePublishRequest,
    AssistedMetaEvidencePublishRequest,
    MetaEvidencePublishRequest,
    MetaEvidencePublishResult,
    EvidenceJson,
    EvidenceDraft,
    EvidencePublishRequest,
    EvidencePublishResult,
    PublishedEvidenceDocument,
    RemotePinningConfig,
} from './types.js';

export type { AttachmentStore, EvidenceStore, MetaEvidenceStore } from './storage-types.js';
export type { EvidencePublisherFactoryOptions, MetaEvidencePublisherFactoryOptions } from './EvidencePublisherFactory.js';

// ─── Main publishers ──────────────────────────────────────────────────────────
export { EvidencePublisher } from './EvidencePublisher.js';
export { MetaEvidencePublisher } from './MetaEvidencePublisher.js';
export { MetaEvidenceJsonBuilder } from './MetaEvidenceJsonBuilder.js';
export { createEvidencePublisher, createMetaEvidencePublisher } from './EvidencePublisherFactory.js';