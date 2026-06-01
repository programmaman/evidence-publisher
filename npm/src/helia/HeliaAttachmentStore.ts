import { HeliaIpfsClient, type HeliaIpfsClientOptions } from './HeliaIpfsClient.js';
import { EvidenceHasher } from '../EvidenceHasher.js';
import type { AttachmentStore } from '../storage-types.js';
import type { Attachment, PublishedAttachment } from '../types.js';

export class HeliaAttachmentStore implements AttachmentStore {
    private readonly client: HeliaIpfsClient;

    constructor(options: HeliaIpfsClientOptions | HeliaIpfsClient) {
        this.client = options instanceof HeliaIpfsClient ? options : new HeliaIpfsClient(options);
    }

    async putAttachment(input: Attachment): Promise<PublishedAttachment> {
        const added = await this.client.addBytes(input.bytes);
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