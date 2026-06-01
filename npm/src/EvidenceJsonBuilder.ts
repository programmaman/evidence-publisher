import type { EvidenceDraft, EvidenceJsonDocument, PublishedAttachment } from './types.js';

export class EvidenceJsonBuilder {
    static build(draft: EvidenceDraft): EvidenceJsonDocument {
        const title = requireNonBlank(draft.title, 'title');
        const description = requireNonBlank(draft.description, 'description');
        const fileUri = normalizeOptional(draft.fileUri);
        const fileHash = normalizeOptional(draft.fileHash);
        const fileTypeExtension = normalizeOptional(draft.fileTypeExtension);

        if (!fileUri && (fileHash || fileTypeExtension)) {
            throw new Error('fileHash and fileTypeExtension require fileUri');
        }

        return {
            title,
            name: title,
            description,
            ...(fileUri ? { fileURI: fileUri } : {}),
            ...(fileHash ? { fileHash } : {}),
            ...(fileTypeExtension ? { fileTypeExtension } : {}),
        };
    }

    static withAttachment(draft: EvidenceDraft, attachment: PublishedAttachment): EvidenceJsonDocument {
        return this.build({
            title: draft.title,
            description: draft.description,
            fileUri: attachment.uri,
            fileHash: attachment.fileHash,
            fileTypeExtension: attachment.fileTypeExtension,
        });
    }

    static withSelfHash(document: EvidenceJsonDocument, selfHash: string): EvidenceJsonDocument {
        return {
            ...this.build({
                title: document.title,
                description: document.description,
                fileUri: document.fileURI,
                fileHash: document.fileHash,
                fileTypeExtension: document.fileTypeExtension,
            }),
            selfHash: requireNonBlank(selfHash, 'selfHash'),
        };
    }
}

function requireNonBlank(value: string, name: string): string {
    if (!value?.trim()) {
        throw new Error(`${name} must not be blank`);
    }
    return value.trim();
}

function normalizeOptional(value: string | undefined): string | undefined {
    return value?.trim() ? value.trim() : undefined;
}