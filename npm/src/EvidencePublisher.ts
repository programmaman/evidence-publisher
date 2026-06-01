import { EvidenceHasher } from './EvidenceHasher.js';
import { EvidenceJsonBuilder } from './EvidenceJsonBuilder.js';
import { HttpPinByCidClient } from './http/HttpPinByCidClient.js';
import type { AttachmentStore, EvidenceStore } from './storage-types.js';
import type {
    Attachment,
    CidInput,
    EvidencePublishRequest,
    EvidencePublishResult,
    PinResult,
    PublishedAttachment,
    PublishedEvidenceDocument,
    RemotePinningConfig,
    RemotePinOutcome,
} from './types.js';

export interface EvidencePublisherOptions {
    attachmentStore?: AttachmentStore;
    documentStore: EvidenceStore;
    /** Optional client for explicit CID pinning operations via {@link EvidencePublisher.pinCid}. */
    pinByCidClient?: HttpPinByCidClient;
    /**
     * Optional remote pinning configuration.
     * When set (and not disabled), the publisher forwards every produced CID to the
     * configured pinning service as a post-publish durability step.
     */
    remotePinning?: RemotePinningConfig;
    /** Called by {@link EvidencePublisher.close} to release underlying resources (e.g. stop Helia). */
    onClose?: () => Promise<void>;
}

export class EvidencePublisher {
    constructor(private readonly options: EvidencePublisherOptions) {}

    async publish(input: EvidencePublishRequest): Promise<EvidencePublishResult> {
        let documentDraft;
        let publishedAttachment: PublishedAttachment | undefined;

        if (input.attachment) {
            if (!this.options.attachmentStore) {
                throw new Error('attachmentStore is required when attachment is provided');
            }
            publishedAttachment = await this.options.attachmentStore.putAttachment(input.attachment);
            documentDraft = EvidenceJsonBuilder.withAttachment(input, publishedAttachment);
        } else {
            documentDraft = EvidenceJsonBuilder.build(input);
        }

        const selfHash = EvidenceHasher.hashEvidenceDocumentWithoutSelfHash(documentDraft);
        const documentWithSelfHash = EvidenceJsonBuilder.withSelfHash(documentDraft, selfHash);
        const publishedDocument: PublishedEvidenceDocument = await this.options.documentStore.putEvidenceDocument(documentWithSelfHash);

        const baseResult: EvidencePublishResult = {
            selfHash,
            documentJson: documentWithSelfHash,
            ...(publishedAttachment ? { attachment: publishedAttachment } : {}),
            document: publishedDocument,
        };

        const remotePinning = await this.runRemotePinning(publishedDocument, publishedAttachment);

        return {
            ...baseResult,
            ...(remotePinning !== undefined ? { remotePinning } : {}),
        };
    }

    async uploadAttachment(input: Attachment): Promise<PublishedAttachment> {
        if (!this.options.attachmentStore) {
            throw new Error('attachmentStore is required to upload attachments');
        }
        return this.options.attachmentStore.putAttachment(input);
    }

    async pinCid(input: CidInput): Promise<PinResult> {
        if (!this.options.pinByCidClient) {
            throw new Error('pinByCidClient is required to pin CIDs');
        }
        // No per-request auth override — the client uses its own configured auth.
        const result = await this.options.pinByCidClient.pinByCid({ cid: input.cid });
        return {
            cid: result.cid ?? input.cid,
            ...(result.cid ? { uri: `ipfs://${result.cid}` } : {}),
        };
    }

    /**
     * Release underlying resources (e.g. stop the Helia node).
     * Always call this when the publisher is no longer needed.
     */
    async close(): Promise<void> {
        await this.options.onClose?.();
    }

    // ── Remote pinning pipeline ──────────────────────────────────────────────

    /**
     * Runs the remote pinning step if configured.
     * Failures are caught and surfaced via {@link RemotePinOutcome.error} so the
     * publish result is never hidden by a persistence failure.
     */
    private async runRemotePinning(
        document: PublishedEvidenceDocument,
        attachment: PublishedAttachment | undefined,
    ): Promise<RemotePinOutcome | undefined> {
        const config = this.options.remotePinning;
        if (!config || config.enabled === false) {
            return undefined;
        }

        const client = new HttpPinByCidClient({
            providerUrl: config.endpoint,
            auth: config.auth,
            requestPath: config.requestPath,
            headers: config.headers,
        });

        try {
            const docPinResponse = await client.pinByCid({ cid: document.cid });
            const documentPin: PinResult = {
                cid: docPinResponse.cid ?? document.cid,
                ...(docPinResponse.cid ? { uri: `ipfs://${docPinResponse.cid}` } : {}),
                ...(docPinResponse.pinId ? { metadata: { pinId: docPinResponse.pinId } } : {}),
            };

            let attachmentPin: PinResult | undefined;
            if (attachment) {
                const attPinResponse = await client.pinByCid({ cid: attachment.cid });
                attachmentPin = {
                    cid: attPinResponse.cid ?? attachment.cid,
                    ...(attPinResponse.cid ? { uri: `ipfs://${attPinResponse.cid}` } : {}),
                    ...(attPinResponse.pinId ? { metadata: { pinId: attPinResponse.pinId } } : {}),
                };
            }

            return {
                documentPin,
                ...(attachmentPin ? { attachmentPin } : {}),
            };
        } catch (err) {
            return {
                error: err instanceof Error ? err : new Error(String(err)),
            };
        }
    }
}