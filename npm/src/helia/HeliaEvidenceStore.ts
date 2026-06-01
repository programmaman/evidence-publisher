import { HeliaIpfsClient, type HeliaIpfsClientOptions } from './HeliaIpfsClient.js';
import { EvidenceHasher } from '../EvidenceHasher.js';
import type { EvidenceStore } from '../storage-types.js';
import type { EvidenceJsonDocument, PublishedEvidenceDocument } from '../types.js';

export class HeliaEvidenceStore implements EvidenceStore {
    private readonly client: HeliaIpfsClient;

    constructor(options: HeliaIpfsClientOptions | HeliaIpfsClient) {
        this.client = options instanceof HeliaIpfsClient ? options : new HeliaIpfsClient(options);
    }

    async putEvidenceDocument(document: EvidenceJsonDocument): Promise<PublishedEvidenceDocument> {
        const added = await this.client.addBytes(EvidenceHasher.serialize(document));
        return {
            cid: added.cid,
            uri: added.uri,
            gatewayUrls: added.gatewayUrls,
        };
    }
}