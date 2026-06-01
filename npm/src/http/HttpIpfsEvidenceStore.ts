import { EvidenceHasher } from '../EvidenceHasher.js';
import type { EvidenceStore } from '../storage-types.js';
import type { EvidenceJsonDocument, PublishedEvidenceDocument } from '../types.js';
import { HttpIpfsClient, type HttpIpfsClientOptions } from './HttpIpfsClient.js';

export class HttpIpfsEvidenceStore implements EvidenceStore {
    private readonly client: HttpIpfsClient;

    constructor(options: HttpIpfsClientOptions | HttpIpfsClient) {
        this.client = options instanceof HttpIpfsClient ? options : new HttpIpfsClient(options);
    }

    async putEvidenceDocument(document: EvidenceJsonDocument): Promise<PublishedEvidenceDocument> {
        const added = await this.client.addBytes(EvidenceHasher.serialize(document), {
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