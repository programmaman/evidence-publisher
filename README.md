# @rakelabs/evidence-publisher

Build and publish ERC-1497 / Kleros **Evidence** and **MetaEvidence** documents to IPFS.
Produces the `evidenceUri` and `metaEvidenceUri` values you pass into your contract or dispute SDKs.

This package is for **developers integrating the SDK** into Kleros-style dispute systems.
It does not decide disputes or enforce rulings. It helps you:

- build valid MetaEvidence and Evidence documents,
- upload them to IPFS through Helia, self-hosted, or third-party provider flows,
- optionally remote-pin the resulting CIDs,
- get back stable `ipfs://...` URIs to use in your dispute workflow.

---

## Install

```sh
npm install @rakelabs/evidence-publisher
```

---

## Start here: the mental model

If you are new to Kleros, the most important thing to understand is that there are **two different document layers**:

### MetaEvidence = the dispute container / template

A **MetaEvidence** document describes the **framework** for a dispute:

- what category the dispute belongs to,
- what question jurors should answer,
- what ruling options exist,
- what policy or rules apply,
- optionally, a PDF or other attachment containing the full written policy.

Think of MetaEvidence as the **container**, **template**, or **policy envelope** for a class of disputes.
It is **not required to describe one specific dispute instance**.

A single MetaEvidence document can be:

- **reused across many disputes** in the same category, or
- made **more specific** for a narrower dispute type, policy version, or product flow.

For example, an Amazon-like marketplace might:

- publish **one reusable MetaEvidence document** for a general buyer-vs-seller dispute flow, or
- publish **multiple MetaEvidence documents** such as:
    - item-not-received disputes,
    - item-not-as-described disputes,
    - seller chargeback disputes,
    - premium marketplace policy v2 disputes.

All of those are valid. The right choice depends on how much policy reuse vs specialization you want.

### Evidence = the proof for one actual dispute

An **Evidence** document is different. It is the actual proof submitted later by a party or end user for a **specific dispute instance**.

Examples:

- an invoice PDF,
- a screenshot,
- a tracking export,
- a conversation transcript,
- a signed contract attachment.

So the rule of thumb is:

- **MetaEvidence** = reusable dispute framework
- **Evidence** = specific proof for one dispute

---

## How Kleros uses these documents

In a typical Kleros-style flow:

1. You publish a **MetaEvidence** document.
2. Your contract or dispute system stores or references the returned `metaEvidenceUri`.
3. When a dispute is created, jurors can use that MetaEvidence to understand the dispute rules and ruling choices.
4. Later, parties submit **Evidence** documents for that particular dispute.
5. Those Evidence documents are linked to the dispute as the factual record.

So when integrating this SDK, you usually need to do **three** things:

1. publish the reusable **policy / category MetaEvidence**,
2. optionally publish a **policy attachment** as part of that MetaEvidence,
3. publish **Evidence** documents as users submit proof during disputes.

---

## The core integration workflow

### Step 1: configure storage once

Create `evidence.storage.yml` next to your code:

```yaml
addressing: content
provider:
  name: my-provider
  url: https://your-upload-endpoint.example/files
  auth:
    type: bearer
    token: ${UPLOAD_TOKEN}
  fields:
    network: public
```

`${UPLOAD_TOKEN}` is resolved from your environment:

- **CI/CD / Docker / Kubernetes**: set it in `process.env`
- **Local dev**: optionally use a `.env` file next to the config

```env
# .env (local dev only — never commit this)
UPLOAD_TOKEN=your-upload-token-here
```

Once this is in place, both publishers reuse the same config:

```ts
import {
  createMetaEvidencePublisher,
  createEvidencePublisher,
} from '@rakelabs/evidence-publisher';

const metaEvidencePublisher = await createMetaEvidencePublisher();
const evidencePublisher = await createEvidencePublisher();
```

You configure storage **once**. Then you use the publisher that matches the document type you are creating.

---

### Step 2: publish a reusable MetaEvidence document

This is the most common first step.

Suppose your marketplace has a general buyer-vs-seller delivery dispute flow.
You can publish one reusable MetaEvidence document for that category and use its URI across many disputes.

```ts
import { createMetaEvidencePublisher } from '@rakelabs/evidence-publisher';

const metaEvidencePublisher = await createMetaEvidencePublisher();

const deliveryDisputeMetaEvidence = await metaEvidencePublisher.publish({
  category: 'Marketplace buyer-seller disputes',
  title: 'Buyer vs Seller Delivery Dispute Policy',
  description: 'Reusable dispute policy for delivery-related marketplace disputes.',
  question: 'Did the seller fulfill the delivery obligation under the marketplace rules?',
  rulingOptions: {
    type: 'single-select',
    precision: 0,
    titles: ['Buyer Wins', 'Seller Wins'],
    descriptions: [
      'Refund the buyer or rule in the buyer’s favor.',
      'Release funds to the seller or rule in the seller’s favor.',
    ],
    reserved: {},
  },
  aliases: {
    buyer: 'Buyer',
    seller: 'Seller',
  },
});

console.log(deliveryDisputeMetaEvidence.document.uri); // ipfs://...
```

You would then store or pass that `document.uri` wherever your contract or dispute system expects the MetaEvidence URI.

---

### Step 3: publish a more specific MetaEvidence document when needed

Sometimes one broad template is not enough.
If different dispute types have different questions or ruling choices, publish multiple MetaEvidence documents.

For example, you might separate "item not received" from "item not as described":

```ts
const itemNotReceivedMetaEvidence = await metaEvidencePublisher.publish({
  category: 'Marketplace buyer-seller disputes',
  title: 'Item Not Received Policy',
  description: 'Used when the buyer claims the seller never delivered the item.',
  question: 'Did the seller deliver the item to the buyer under the marketplace rules?',
  rulingOptions: {
    type: 'single-select',
    precision: 0,
    titles: ['Buyer Wins', 'Seller Wins'],
    descriptions: [
      'The item was not delivered under the applicable policy.',
      'The seller satisfied the delivery obligation.',
    ],
    reserved: {},
  },
});

console.log(itemNotReceivedMetaEvidence.document.uri); // ipfs://...
```

That is the key architectural idea:

- reuse one MetaEvidence document when your dispute framework is stable,
- publish multiple MetaEvidence documents when categories, policy versions, or ruling logic differ.

---

### Step 4: attach a PDF policy document to MetaEvidence when useful

If you already have a written policy PDF, you can publish it together with MetaEvidence.
The SDK uploads the attachment first, then fills:

- `fileURI`
- `fileHash`
- `fileTypeExtension`

for you.

```ts
const policyWithPdf = await metaEvidencePublisher.publish({
  category: 'Marketplace buyer-seller disputes',
  title: 'Buyer vs Seller Policy v2',
  description: 'Reusable policy with a PDF attachment.',
  question: 'Did the seller satisfy the marketplace delivery rules?',
  rulingOptions: {
    type: 'single-select',
    precision: 0,
    titles: ['Buyer Wins', 'Seller Wins'],
    descriptions: ['Rule for the buyer.', 'Rule for the seller.'],
    reserved: {},
  },
  attachment: {
    bytes: policyPdfBytes,
    fileName: 'marketplace-policy-v2.pdf',
    mediaType: 'application/pdf',
    fileTypeExtension: 'pdf',
  },
});

console.log(policyWithPdf.attachment?.uri); // ipfs://... PDF
console.log(policyWithPdf.document.uri);    // ipfs://... MetaEvidence JSON
```

Use this when jurors should be able to inspect a full written policy document, not just the short JSON fields.

---

### Step 5: publish Evidence for one actual dispute

Once a specific dispute exists, parties or end users can upload their proof.
That is what `EvidencePublisher` is for.

```ts
import { createEvidencePublisher } from '@rakelabs/evidence-publisher';

const evidencePublisher = await createEvidencePublisher();

const evidenceResult = await evidencePublisher.publish({
  title: 'Tracking screenshot',
  description: 'Carrier page showing the package was never marked delivered.',
  attachment: {
    bytes: fileBytes,
    fileName: 'tracking-screenshot.png',
    mediaType: 'image/png',
    fileTypeExtension: 'png',
  },
});

console.log(evidenceResult.document.uri);  // ipfs://... evidence JSON
console.log(evidenceResult.attachment?.uri); // ipfs://... attachment
```

This Evidence document is for **one concrete dispute submission**, not the reusable dispute policy.

---

## What to upload, in plain English

If you are integrating a Kleros-style system, the usual pattern is:

### A) Upload the reusable dispute policy

Use **MetaEvidence** for:

- marketplace-wide buyer/seller policy,
- one dispute category template,
- one product-line policy,
- one policy version,
- one narrow dispute type if needed.

### B) Optionally attach the full written policy

Still use **MetaEvidence**, but include an attachment so the final JSON points to the PDF.

### C) Upload the evidence users submit later

Use **Evidence** for:

- invoices,
- screenshots,
- delivery records,
- chat logs,
- signed contracts,
- any case-specific proof.

---

## MetaEvidence vs Evidence

Use this rule of thumb:

- **MetaEvidence** = the reusable dispute template / container
- **Evidence** = the proof for one specific dispute

Another way to think about it:

- MetaEvidence tells jurors **how to think about the dispute**
- Evidence tells jurors **what happened in this specific case**

---

## 30-second quickstart

If you already understand the concepts, this is the shortest working flow.

### Publish MetaEvidence

```ts
import { createMetaEvidencePublisher } from '@rakelabs/evidence-publisher';

const metaEvidencePublisher = await createMetaEvidencePublisher();

const metaEvidenceResult = await metaEvidencePublisher.publish({
  category: 'Escrow',
  title: 'Late delivery dispute',
  description: 'Used when a seller claims delivery was completed late.',
  question: 'Did the seller deliver the work on time?',
  rulingOptions: {
    type: 'single-select',
    precision: 0,
    titles: ['Buyer Wins', 'Seller Wins'],
    descriptions: ['Refund the buyer.', 'Release funds to the seller.'],
    reserved: {},
  },
});

console.log(metaEvidenceResult.document.uri); // ipfs://...
```

### Publish Evidence

```ts
import { createEvidencePublisher } from '@rakelabs/evidence-publisher';

const evidencePublisher = await createEvidencePublisher();

const evidenceResult = await evidencePublisher.publish({
  title: 'Proof of delivery delay',
  description: 'Screenshots and invoice attached.',
  attachment: {
    bytes: fileBytes,
    fileName: 'invoice.pdf',
    mediaType: 'application/pdf',
    fileTypeExtension: 'pdf',
  },
});

console.log(evidenceResult.document.uri);  // ipfs://...
```

`createEvidencePublisher()` and `createMetaEvidencePublisher()` both read `evidence.storage.yml` from `process.cwd()`. No `.env` file is required in production.

---

## Storage configuration model

The SDK is **not tied to Pinata**. It works with a generic storage configuration model and can target:

- a third-party hosted upload provider,
- a self-hosted HTTP upload endpoint,
- a local or self-hosted Kubo-style endpoint,
- in-process Helia when no provider URL is supplied.

The same config model works for both `createEvidencePublisher()` and `createMetaEvidencePublisher()`.

### Generic content-addressed example

```yaml
addressing: content
provider:
  name: my-provider
  url: https://your-upload-endpoint.example/files
  auth:
    type: bearer
    token: ${UPLOAD_TOKEN}
  headers:
    x-custom-header: my-value
  fields:
    network: public
```

Important fields:

- `addressing`: usually `content` for IPFS-style content addressing
- `provider.name`: a human-readable provider label
- `provider.url`: the upload endpoint; omit it to use in-process Helia
- `provider.auth`: authentication strategy (`none`, `bearer`, `basic`, or custom header auth)
- `provider.headers`: optional extra HTTP headers
- `provider.fields`: optional provider-specific request fields
- `remotePinning`: optional second-step CID pinning after upload

When `provider.url` is present, the SDK uses HTTP upload behavior.
When `provider.url` is omitted under content addressing, the SDK starts local Helia automatically.

### Provider examples

#### Pinata v3

```yaml
addressing: content
provider:
  name: pinata-v3
  url: https://uploads.pinata.cloud/v3/files
  auth:
    type: bearer
    token: ${PINATA_JWT}
  fields:
    network: public        # required by Pinata v3
```

#### Self-hosted Kubo node

```yaml
addressing: content
provider:
  name: kubo-local
  url: http://localhost:5001/api/v0/add
  auth:
    type: none
```

#### Local in-process Helia (no network required)

```yaml
addressing: content
provider:
  name: helia-local
  # no url = Helia starts in-process automatically
```


---

## Remote pinning (optional durability step)

After any upload, you can pin the resulting CID to a separate pinning service.
Add a `remotePinning` block to your config:

```yaml
addressing: content
provider:
  name: kubo-local
  url: http://localhost:5001/api/v0/add
  auth:
    type: none
remotePinning:
  endpoint: https://api.pinata.cloud/v3
  auth:
    type: bearer
    token: ${PINATA_JWT}
```

The publish result carries the outcome:

```ts
metaEvidenceResult.remotePinning?.documentPin
metaEvidenceResult.remotePinning?.error

evidenceResult.remotePinning?.documentPin
evidenceResult.remotePinning?.attachmentPin
evidenceResult.remotePinning?.error
```

The document upload still succeeds even if remote pinning fails.

---

## API at a glance

```ts
import {
  createEvidencePublisher,
  createMetaEvidencePublisher,
  MetaEvidenceJsonBuilder,
} from '@rakelabs/evidence-publisher';

// Config-driven publishers
const evidencePublisher = await createEvidencePublisher();
const metaEvidencePublisher = await createMetaEvidencePublisher();

// Explicit config in code
const evidencePublisherWithConfig = await createEvidencePublisher({
  config: {
    addressing: 'content',
    provider: {
      name: 'pinata-v3',
      url: 'https://uploads.pinata.cloud/v3/files',
      auth: { type: 'bearer', token: process.env.PINATA_JWT! },
      fields: { network: 'public' },
    },
    pinning: { enabled: false },
  },
});

// Build MetaEvidence JSON without publishing
const metaEvidenceJson = MetaEvidenceJsonBuilder.build({
  category: 'Escrow',
  title: 'Delivery dispute',
  description: 'Reusable dispute template',
  question: 'Did the seller deliver on time?',
  rulingOptions: {
    type: 'single-select',
    precision: 0,
    titles: ['Buyer Wins', 'Seller Wins'],
    descriptions: ['Refund buyer', 'Release to seller'],
    reserved: {},
  },
});

// Publish Evidence
const evidenceResult = await evidencePublisher.publish({
  title: 'Tracking proof',
  description: 'Carrier export',
});

// Publish MetaEvidence
const metaEvidenceResult = await metaEvidencePublisher.publish({
  category: 'Escrow',
  title: 'Delivery dispute',
  description: 'Reusable dispute template',
  question: 'Did the seller deliver on time?',
  rulingOptions: {
    type: 'single-select',
    precision: 0,
    titles: ['Buyer Wins', 'Seller Wins'],
    descriptions: ['Refund buyer', 'Release to seller'],
    reserved: {},
  },
});
```

---

## Advanced / power users

Import from the `/advanced` subpath for raw config helpers and HTTP transport clients:

```ts
import {
  createHttpEvidencePublisher,
  createHttpMetaEvidencePublisher,
  parseStorageConfig,
  readStorageConfigFile,
  HttpMultipartUploadClient,
  HttpPinByCidClient,
} from '@rakelabs/evidence-publisher/advanced';
```

Use `createHttpEvidencePublisher()` / `createHttpMetaEvidencePublisher()` when you need:

- browser or edge-friendly synchronous construction,
- custom `parseResponse` logic,
- custom `serializeRequest` logic,
- direct control over the HTTP upload setup.

```ts
import {
  createHttpEvidencePublisher,
  createHttpMetaEvidencePublisher,
} from '@rakelabs/evidence-publisher/advanced';

const sharedConfig = {
  endpoint: 'https://uploads.pinata.cloud/v3/files',
  auth: { type: 'bearer', token: process.env.PINATA_JWT! },
  fields: { network: 'public' },
};

const evidencePublisher = createHttpEvidencePublisher({
  ...sharedConfig,
  parseResponse: (body) => (body as any).data?.cid,
});

const metaEvidencePublisher = createHttpMetaEvidencePublisher(sharedConfig);
```