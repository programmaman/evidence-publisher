import { keccak256, toUtf8Bytes } from 'ethers';
import type { EvidenceJsonDocument } from './types.js';

export class EvidenceHasher {
    static hashBytes(bytes: Uint8Array): string {
        return keccak256(bytes);
    }

    static serializeWithoutSelfHash(document: EvidenceJsonDocument): Uint8Array {
        const normalized = {
            title: document.title,
            name: document.name,
            description: document.description,
            ...(document.fileURI ? { fileURI: document.fileURI } : {}),
            ...(document.fileHash ? { fileHash: document.fileHash } : {}),
            ...(document.fileTypeExtension ? { fileTypeExtension: document.fileTypeExtension } : {}),
        };
        return toUtf8Bytes(JSON.stringify(normalized));
    }

    static serialize(document: EvidenceJsonDocument): Uint8Array {
        const normalized = {
            title: document.title,
            name: document.name,
            description: document.description,
            ...(document.fileURI ? { fileURI: document.fileURI } : {}),
            ...(document.fileHash ? { fileHash: document.fileHash } : {}),
            ...(document.fileTypeExtension ? { fileTypeExtension: document.fileTypeExtension } : {}),
            ...(document.selfHash ? { selfHash: document.selfHash } : {}),
        };
        return toUtf8Bytes(JSON.stringify(normalized));
    }

    static hashEvidenceDocumentWithoutSelfHash(document: EvidenceJsonDocument): string {
        return keccak256(this.serializeWithoutSelfHash(document));
    }
}