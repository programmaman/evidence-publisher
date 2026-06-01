import { EvidenceHasher } from '../EvidenceHasher.js';
import type { AttachmentStore } from '../storage-types.js';
import type { Attachment, PublishedAttachment } from '../types.js';
import { HttpIpfsClient, type HttpIpfsClientOptions } from './HttpIpfsClient.js';

export class HttpIpfsAttachmentStore implements AttachmentStore {
    private readonly client: HttpIpfsClient;

    constructor(options: HttpIpfsClientOptions | HttpIpfsClient) {
        this.client = options instanceof HttpIpfsClient ? options : new HttpIpfsClient(options);
    }

    async putAttachment(input: Attachment): Promise<PublishedAttachment> {
        const added = await this.client.addBytes(input.bytes, {
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