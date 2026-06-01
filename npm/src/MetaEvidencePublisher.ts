import { MetaEvidenceJsonBuilder } from './MetaEvidenceJsonBuilder.js';
import { HttpPinByCidClient } from './http/HttpPinByCidClient.js';
import type { AttachmentStore, MetaEvidenceStore } from './storage-types.js';
import type {
    Attachment,
    CidInput,
    MetaEvidencePublishRequest,
    MetaEvidencePublishResult,
    PinResult,
    PublishedAttachment,
    PublishedEvidenceDocument,
    RemotePinningConfig,
    RemotePinOutcome,
} from './types.js';

export interface MetaEvidencePublisherOptions {
    attachmentStore?: AttachmentStore;
    documentStore: MetaEvidenceStore;
    /** Optional client for explicit CID pinning via {@link MetaEvidencePublisher.pinCid}. */
    pinByCidClient?: HttpPinByCidClient;
    /**
     * Optional remote pinning configuration.
     * When set (and not disabled), every produced CID is forwarded to the
     * configured pinning service as a post-publish durability step.
     */
    remotePinning?: RemotePinningConfig;
    /** Called by {@link MetaEvidencePublisher.close} to release underlying resources. */
    onClose?: () => Promise<void>;
}

export class MetaEvidencePublisher {
    constructor(private readonly options: MetaEvidencePublisherOptions) {}

    /**
     * Publish a MetaEvidence document.
     *
     * - **Manual path**: supply the full draft (file fields optional).
     * - **Assisted path**: include `attachment` on the request; the SDK uploads
     *   the attachment first and wires its URI / hash into the MetaEvidence JSON.
     *   Attachment-derived file metadata takes precedence over any file fields
     *   provided on the draft.
     */
    async publish(input: MetaEvidencePublishRequest): Promise<MetaEvidencePublishResult> {
        let documentJson;
        let publishedAttachment: PublishedAttachment | undefined;

        if ('attachment' in input && input.attachment) {
            if (!this.options.attachmentStore) {
                throw new Error('attachmentStore is required when attachment is provided');
            }
            publishedAttachment = await this.options.attachmentStore.putAttachment(input.attachment);
            documentJson = MetaEvidenceJsonBuilder.withAttachment(input, publishedAttachment);
        } else {
            documentJson = MetaEvidenceJsonBuilder.build(input);
        }

        const publishedDocument: PublishedEvidenceDocument =
            await this.options.documentStore.putMetaEvidenceDocument(documentJson);

        const baseResult: MetaEvidencePublishResult = {
            documentJson,
            document: publishedDocument,
            ...(publishedAttachment ? { attachment: publishedAttachment } : {}),
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