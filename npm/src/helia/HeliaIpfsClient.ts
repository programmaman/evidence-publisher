import { createHelia } from 'helia';
import { unixfs } from '@helia/unixfs';
import type { ContentAddResult, ContentPublishOptions } from '../storage-types.js';

export interface HeliaIpfsClientOptions extends ContentPublishOptions {
    helia?: unknown;
}

export class HeliaIpfsClient {
    private nodePromise?: Promise<unknown>;

    constructor(private readonly options: HeliaIpfsClientOptions) {}

    async addBytes(bytes: Uint8Array): Promise<ContentAddResult> {
        const node = await this.getHeliaNode();
        const fs = unixfs(node as never);
        const cid = await fs.addBytes(bytes);
        const cidText = cid.toString();

        if (this.options.pinning?.enabled) {
            await this.pinCid(node, cid);
        }

        return {
            cid: cidText,
            uri: `ipfs://${cidText}`,
            gatewayUrls: buildGatewayUrls(cidText, this.options.gatewayBaseUrls),
        };
    }

    private getHeliaNode(): Promise<unknown> {
        if (!this.nodePromise) {
            this.nodePromise = this.initializeHeliaNode();
        }

        return this.nodePromise;
    }

    private async initializeHeliaNode(): Promise<unknown> {
        return this.options.helia ?? await createHelia();
    }

    async stop(): Promise<void> {
        if (!this.nodePromise) return;
        const node = await this.nodePromise;
        const n = node as { stop?: () => Promise<void> };
        if (typeof n.stop === 'function') {
            await n.stop();
        }
        this.nodePromise = undefined;
    }

    private async pinCid(node: unknown, cid: unknown): Promise<void> {
        const pins = (node as { pins?: { add?: (target: unknown, options?: { signal?: AbortSignal }) => AsyncIterable<unknown> } }).pins;
        if (!pins?.add) {
            throw new Error('Helia node does not expose pins.add(...)');
        }

        for await (const _ of pins.add(cid, { signal: AbortSignal.timeout(5000) })) {
            // Consume async iterator so the pin operation completes.
        }
    }
}


export function buildGatewayUrls(cid: string, gatewayBaseUrls?: string[]): string[] {
    if (!gatewayBaseUrls || gatewayBaseUrls.length === 0) {
        return [];
    }

    return gatewayBaseUrls.map((baseUrl) => {
        const trimmed = baseUrl.trim();
        if (trimmed.includes('{cid}')) {
            return trimmed.replace(/\{cid}/g, cid);
        }

        return `${trimmed.replace(/\/+$/, '')}/ipfs/${cid}`;
    });
}