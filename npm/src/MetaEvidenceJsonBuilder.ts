import type { MetaEvidence, MetaEvidenceDraft, PublishedAttachment } from './types.js';

/**
 * Builds the canonical {@link MetaEvidence} JSON object from a caller-supplied
 * draft.  Enforces required fields and normalizes optional ones.
 *
 * Business-specific defaults (escrow roles, dispute categories, ruling labels)
 * are intentionally **not** provided here.  Defaults belong in consuming SDKs
 * or applications, not in the shared evidence SDK.
 */
export class MetaEvidenceJsonBuilder {
    /**
     * Build a MetaEvidence document from a draft.
     * Required fields (`category`, `title`, `description`, `question`,
     * `rulingOptions`) are validated.  Optional fields are included only when
     * non-blank (strings) or truthy (numbers / objects).
     */
    static build(draft: MetaEvidenceDraft): MetaEvidence {
        const category = requireNonBlank(draft.category, 'category');
        const title = requireNonBlank(draft.title, 'title');
        const description = requireNonBlank(draft.description, 'description');
        const question = requireNonBlank(draft.question, 'question');

        if (!draft.rulingOptions) {
            throw new Error('rulingOptions must be provided');
        }

        const fileURI = normalizeString(draft.fileURI);
        const fileHash = normalizeString(draft.fileHash);
        const fileTypeExtension = normalizeString(draft.fileTypeExtension);

        if (!fileURI && (fileHash || fileTypeExtension)) {
            throw new Error('fileHash and fileTypeExtension require fileURI');
        }

        // Build the document with stable key ordering that matches the Kleros
        // Court expected shape (category first, then title/description, etc.)
        const doc: MetaEvidence = {
            category,
            title,
            description,
            question,
            rulingOptions: draft.rulingOptions,
        };

        if (draft.aliases && Object.keys(draft.aliases).length > 0) {
            doc.aliases = draft.aliases;
        }

        if (fileURI) {
            doc.fileURI = fileURI;
            if (fileHash) doc.fileHash = fileHash;
            if (fileTypeExtension) doc.fileTypeExtension = fileTypeExtension;
        }

        const evidenceDisplayInterfaceURI = normalizeString(draft.evidenceDisplayInterfaceURI);
        if (evidenceDisplayInterfaceURI) {
            doc.evidenceDisplayInterfaceURI = evidenceDisplayInterfaceURI;
            const evidenceDisplayInterfaceHash = normalizeString(draft.evidenceDisplayInterfaceHash);
            if (evidenceDisplayInterfaceHash) doc.evidenceDisplayInterfaceHash = evidenceDisplayInterfaceHash;
        }

        const dynamicScriptURI = normalizeString(draft.dynamicScriptURI);
        if (dynamicScriptURI) {
            doc.dynamicScriptURI = dynamicScriptURI;
            const dynamicScriptHash = normalizeString(draft.dynamicScriptHash);
            if (dynamicScriptHash) doc.dynamicScriptHash = dynamicScriptHash;
        }

        const arbitrableInterfaceURI = normalizeString(draft.arbitrableInterfaceURI);
        if (arbitrableInterfaceURI) doc.arbitrableInterfaceURI = arbitrableInterfaceURI;

        if (draft.arbitrableChainID != null) doc.arbitrableChainID = draft.arbitrableChainID;
        if (draft.arbitratorChainID != null) doc.arbitratorChainID = draft.arbitratorChainID;

        const arbitrableJsonRpcUrl = normalizeString(draft.arbitrableJsonRpcUrl);
        if (arbitrableJsonRpcUrl) doc.arbitrableJsonRpcUrl = arbitrableJsonRpcUrl;

        const arbitratorJsonRpcUrl = normalizeString(draft.arbitratorJsonRpcUrl);
        if (arbitratorJsonRpcUrl) doc.arbitratorJsonRpcUrl = arbitratorJsonRpcUrl;

        if (draft._v != null) doc._v = draft._v;

        return doc;
    }

    /**
     * Build a MetaEvidence document for the assisted publish path.
     * Attachment-derived metadata (`fileURI`, `fileHash`, `fileTypeExtension`)
     * is injected from the published attachment, overriding any values that
     * may have been supplied on the draft.
     */
    static withAttachment(draft: MetaEvidenceDraft, attachment: PublishedAttachment): MetaEvidence {
        return this.build({
            ...draft,
            fileURI: attachment.uri,
            fileHash: attachment.fileHash,
            fileTypeExtension: attachment.fileTypeExtension,
        });
    }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function requireNonBlank(value: string | undefined, name: string): string {
    if (!value?.trim()) {
        throw new Error(`${name} must not be blank`);
    }
    return value.trim();
}

function normalizeString(value: string | undefined): string | undefined {
    return value?.trim() ? value.trim() : undefined;
}