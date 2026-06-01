import type { ProviderConfig, PinningConfig } from './config.js';
import type { Attachment, EvidenceJsonDocument, MetaEvidence, PublishedAttachment, PublishedEvidenceDocument } from './types.js';

export interface ContentPublishOptions {
    provider?: ProviderConfig;
    pinning?: PinningConfig;
    gatewayBaseUrls?: string[];
}

export interface ContentAddResult {
    cid: string;
    uri: string;
    gatewayUrls?: string[];
}

export interface AttachmentStore {
    putAttachment(input: Attachment): Promise<PublishedAttachment>;
}

export interface EvidenceStore {
    putEvidenceDocument(document: EvidenceJsonDocument): Promise<PublishedEvidenceDocument>;
}

export interface MetaEvidenceStore {
    putMetaEvidenceDocument(document: MetaEvidence): Promise<PublishedEvidenceDocument>;
}