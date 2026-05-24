# Key Learnings — RAG Project

## 1. Implementation Overview

This project implements a complete **Retrieval-Augmented Generation (RAG) pipeline** with two distinct operational modes: **data ingestion** (offline) and **query serving** (online). The four primary external services — a file reader, **Ollama** (for embeddings and generation), **Qdrant** (as the vector database), and an **Express** REST API — are connected through a unified configuration layer.

### Ingestion Pipeline

The offline ingestion path reads a plain-text knowledge source and transforms it into searchable vector records stored in Qdrant. The pipeline is composed of five stages, each implemented as an **asynchronous generator** (see § 2e), forming a clean streaming chain with no accumulation of state between stages:

```
File → Loader → Chunker → BatchCreator → Embedder → Qdrant Store
```

- **`createFileStreamLoader`** (`src/ingest/loader.ts`) opens a `Readable` from `fs` and yields raw text chunks at a fixed byte size. This keeps memory usage constant regardless of document size.
- **`createRecursiveChunker`** (`src/ingest/chunker.ts`) maintains a rolling character buffer and emits fixed-size chunks, shedding overlap bytes on each iteration to preserve context continuity.
- **`createBatchCreator`** (`src/ingest/batchCreator.ts`) accumulates the individual string chunks into batches of a configurable size, yielding the batch array once full.
- **`createEmbedder`** (`src/ingest/embedder.ts`) fans out `Ollama` embedding calls with `Promise.all` on each batch, converts each text string into a 768-dimensional float vector, and yields `EmbeddedChunk` objects.
- **`storeEmbeddings`** (`src/ingest/store.ts`) consumes the `EmbeddedChunk` stream and upserts each batch into Qdrant with `wait: true` (blocking acknowledgement).

The entrypoint in `src/ingest/index.ts` wires all five stages together with a single `storeEmbeddings(embedder)` call, passing the async generator directly without collecting or buffering any intermediate results in application code.

### Query / Inference Pipeline

When a user sends a `POST /ask` request, the Express server in `src/index.ts` receives the prompt, calls the RAG orchestrator, and returns the answer as JSON:

```
User Query → embedQuery → Qdrant Search → Context Assembly → Ollama Generate → Response
```

The core pipeline in `src/rag/index.ts` is:

1. **Embed the query** — `generateEmbedding(query)` calls `GET /api/embeddings` on Ollama using the same model (`nomic-embed-text`) and prompt prefix used during ingestion, ensuring vector-space alignment.
2. **Retrieve top-K chunks** — `retrieveRelevantChunks` runs a `search` call against the `"documents"` Qdrant collection with `limit: topK` (default 3) and retrieves the full payload alongside the similarity score.
3. **Build the prompt** — Pre-computed prompt template (`RETRIVE_OPTIONS.prompt`) wraps the user question inside a structured CONTEXT / QUESTION / FINAL ANSWER scaffold.
4. **Generate the answer** — `callResponseModel` sends a non-streaming `POST /api/generate` to Ollama with the assembled prompt.

The stability of this architecture depends on the **ingestion pipeline and query pipeline sharing the exact same embedding model, prompt prefix, and vector dimensions** — any divergence breaks the similarity search.

---

## 2. Core Technical Concepts

### 2a. Retrieval-Augmented Generation (RAG) Architecture

**Theoretical principle.**  
RAG solves the fundamental hallucination problem of parametric language models by grounding the generation step on *retrieved evidence* rather than on parameters learned during training. It decouples model knowledge from its parametric weights: the LLM never needs to memorize domain-specific information; instead, relevant context is injected at inference time. This makes RAG superior to fine-tuning for rapidly changing or proprietary corpora, because updating knowledge involves simply re-indexing — no GPU compute required.

**Implementation in this codebase.**  
The orchestrator in `src/rag/index.ts` (lines 5–11) is a pure, synchronous-looking async function that chains four ordered operations. Critically, the embedding model used at query time (`generateEmbedding`) is identical to the one used during ingestion (`createEmbedder` calls `generateEmbedding` for each chunk). The embedding model is configured once in `RETRIVE_OPTIONS` (`src/constants/index.ts:42`):

```
model: "nomic-embed-text",
prompt: "Prepare this text for semantic search embedding. …"
```

This shared identity is the single most important invariant of the RAG architecture. The cosine similarity metric in Qdrant assumes that query and document embeddings live in the same vector space, which they do only if the same model and prompt formatter are used end-to-end. The codebase enforces this by centralising all embedder configuration in `EMBEDDER_OPTIONS` and importing it from both the ingestion and inference paths.

**Key contrast with fine-tuning.**  
A fine-tuned model absorbs training data into its weights, making updates expensive and opaque. A RAG system stores the data externally in a vector store; retraining is unnecessary, memory is cheap, and the context clues are transparent (retrievable chunks can be logged and audited).

---

### 2b. Embedding Models and Their Direct Impact on Retrieval Quality

**Theoretical principle.**  
Embedding models project unstructured text into a continuous vector space where **semantic similarity corresponds to geometric proximity**. The quality of this projection — the degree to which paraphrases, near-synonyms, and related-domain terms resolve to nearby vectors — is entirely determined by the embedding model's training data and architecture. A poor model places unrelated but syntactically similar documents near each other; an excellent model clusters documents by *meaning*, not by surface form.

**Implementation in this codebase.**  

The embedder configuration in `src/constants/index.ts:18` reserves the choice among three models:

```ts
model: 'nomic-embed-text' | 'mxbai-embed-large',
```

This project actively selected **`nomic-embed-text`**, a 768-dimensional open model fine-tuned for general-purpose semantic retrieval. The 768 dimension is significant: it is hardcoded into the Qdrant collection schema at `src/playground/index.ts:10` as:

```ts
size: 768,
```

If the active embedding model had been changed without updating this schema, all insertions would have failed silently or produced corrupted vectors. This coupling between *model choice* and *schema definition* is a recurring invisible dependency in RAG systems.

The **prompt prefix** appended in `src/api/models.ts:53`:

```ts
prompt: EMBEDDER_OPTIONS.prompt + text
```

is where the embedding model's no-op becomes an active semantic cue. By prepending `"Prepare this text for semantic search embedding. ∀ Preserve all factual information..."`, the embedding is not taken from the model's default self-attention over the text alone, but from attention over the text *in the presence of an explicit instruction*. This nudges the vector toward document-level semantics rather than sentence-level syntax. The key takeaway: **embedding prompt prefixes are an underused, free parameter that directly affect retrieval precision**, and they should be treated as first-class configuration, chosen with as much care as the model itself.

---

### 2c. Similarity Search Mechanisms and Vector Database Integration

**Theoretical principle.**  
Vector databases solve the *approximate nearest neighbour (ANN)* problem: given a high-dimensional query vector, quickly identify the stored vectors closest to it in the chosen distance metric. Qdrant uses **HNSW (Hierarchical Navigable Small World)** graphs internally, which achieve `O(log n)` query complexity in practice. The specific distance metric must be **consistent** between how vectors are indexed and how search is performed.

**Implementation in this codebase.**  

The collection schema is defined at `src/playground/index.ts:8–13`:

```ts
await client.createCollection("documents", {
    vectors: {
        size: 768,
        distance: "Cosine",
    },
});
```

`"Cosine"` is the distance metric. Qdrant computes `1 − cosine_similarity(aq, d)` as the distance, so a score of `1.0` from search results means identical, and `0.0` means orthogonal. The search call in `src/rag/retrieve.ts:27` passes `with_payload: true`, ensuring the original text chunk is returned alongside the similarity score without requiring a second lookup.

```ts
const response = await client.search(STORE_OPTIONS.collectionName, {
    vector: queryEmbedding,
    limit: topK,
    with_payload: true,
});
```

The `topK` parameter is the core hyperparameter of retrieval. Setting it too low risks missing relevant documents; setting it too high dilutes the LLM's context window with noise. This codebase defaults `topK = 3` at the call site (`src/rag/index.ts:7`) but expects it to be configurable. The `getDbClient` singleton in `src/db/vectorStore.ts` is a standard dependency-injection-at-a-distance pattern that avoids re-creating the HTTP client on every call:

```ts
let instance: QdrantClient | null = null;
if (!instance) { instance = new QdrantClient(...) }
```

This is particularly important for Qdrant because each HTTP connection sets up internal connection pool state, and rapidly recreating clients degrades throughput and increases the risk of hitting rate limits.

---

### 2d. Prompt Engineering Strategies Used

**Theoretical principle.**  
Prompt engineering in RAG has two distinct layers: the **(ingestion-level) embedding prompt** (see § 2b) that conditions how content is projected into vector space, and the **(inference-level) LLM prompt** that conditions how the LLM processes retrieved context. The latter is where "constitutional AI" style constraints — explicit rules about what the model should and should not say — have been empirically shown to reduce hallucination more effectively than length alone.

**Implementation in this codebase.**  

The inference prompt is defined in `src/constants/index.ts:62` as a typed callback and used in `src/rag/prompt.ts:20`. The structured container is:

```
CONTEXT:   [Chunk 1]
           (retrieved document text)

QUESTION:  (user's query)

FINAL ANSWER:
```

The rules injected at the top of the system context are:

- **"Answer the question using ONLY the provided context"** — zero-tolerance fact grounding; model cannot describe pre-training facts not in the vector store.
- **"Do NOT mention chunks, context, sources, or explanations"** — prevents LLM meta-commentary that degrades UX.
- **"Do NOT say 'Based on the provided context'"** — an additional guard against grounding language that unnecessarily telegraphs the RAG mechanism.
- **"If the answer is not in the context, return exactly: 'I could not find the answer…'"** — forces a labelled abstain behaviour with no ambiguity, turning the refusal into a predictable output, not a model-length variation.

The context is built by iterating over `chunks` and formatting each as `[Chunk N]\n{content}`. The numbered chunk indices provide the LLM with a stable positional memory anchor, improving multi-chunk reasoning (e.g. comparing Chunk 1 and Chunk 3).

---

### 2e. Advanced Python Patterns: Asynchronous Generator Functions

> **Note:** This TypeScript/JavaScript codebase implements the same structural pattern that Python calls `async def`. The `async function*` / `for await...of` construct is the JS/TS analogue of Python's `async generator` (`async def ... yield`).

**Theoretical principle.**  
Asynchronous generators (`async function*`) are a control-flow primitive that combines the *producer* contract of iterators with the *await-ability* of promises. Unlike Promise chains, which require all call sites to be restructured when a new async stage is added, async generators create a **fluent pipeline contract** where each stage only knows about its direct input and its direct output. Unlike RxJS or Node streams, they carry zero additional library weight and their behaviour is directly readable as sequential logic.

**Implementation in this codebase.**  

The five-stage ingestion pipeline in `src/ingest/index.ts` (lines 14–19) demonstrates a complete producer-chain pattern:

| Stage | File | Yields |
|---|---|---|
| Loader | `loader.ts` | raw `string` (raw bytes from `fs.Readable`) |
| Chunker | `chunker.ts` | bounded `string` slices of exactly `CHUNK_SIZE` chars |
| BatchCreator | `batchCreator.ts` | `string[]` of `BATCH_SIZE` items |
| Embedder | `embedder.ts` | `EmbeddedChunk[]` (content + 768-D vector) |
| Store | `store.ts` | no yield — terminal consumer |

Each stage is initiated with `for await (const item of upstream)`. No intermediate array or buffer is maintained across stages except where explicitly needed (e.g. the overlap buffer in the chunker, and the batch accumulator in the batch creator). The `for await...of` loop is the async/await equivalent of a synchronous `for x in y`, but where `y` is an async pull-based data source — it backpressures naturally: it will not advance to chunk N + 1 until the embedding for chunk N has resolved. This backpressure property prevents the Ollama API from being saturated by a flood of unprocessed requests.

**Trade-offs vs alternatives.**

| Approach | Latency | Memory | Complexity |
|---|---|---|---|
| Promise chain (await each sequentially) | High (one at a time) | O(batch) | Low |
| `Promise.all` on everything | Low (all concurrent) | O(all) | Medium, but no backpressure |
| **Async generators + `Promise.all` per batch** | **Balanced** | **O(batch)** | **Low, explicit** |

The chosen approach in `src/ingest/embedder.ts:8` applies `Promise.all` only *within* a batch — parallelising within the batch while serialising between batches. This provides the best of both worlds: maximal throughput from parallel embedding calls, and bounded memory from never accumulating more than one batch's worth of pending work.

---

## 3. Data Processing & Optimization

### 3a. Chunking Strategies

**Theoretical principle.**  
Text must be fragmented into discrete passages before it can be embedded and indexed. However, naive splitting — cutting at arbitrary byte positions — produces semantically broken fragments at sentence and paragraph boundaries, destroying retrieval recall. A good chunking algorithm must respect **structural boundaries** (paragraph breaks, headings) while satisfying a **maximum length constraint** imposed by the embedding model's context window and the vector store's performance profile.

**Implementation in this codebase.**  

`src/ingest/loader.ts` uses `fs.createReadStream` with a `LOADER_OPTIONS.chunkSize = 100`, which splits at byte boundaries — these raw "tokens" are language-neutral and may bisect words. The `createRecursiveChunker` in `src/ingest/chunker.ts` then reconstructs coherence:

```
CHUNK_OPTIONS.chunkSize = 100    // characters per chunk
CHUNK_OPTIONS.chunkOverlap = 20  // characters of overlap between adjacent chunks
```

The effective overlap is clamped to `chunkSize - 1` (`src/ingest/chunker.ts:6`) — yielding a maximum overlap of 99 when `chunkOverlap` exceeds `chunkSize`, for safety. The loop in `src/ingest/chunker.ts:13-17`:

```ts
while (buffer.length >= CHUNK_OPTIONS.chunkSize) {
    const chunk = buffer.substring(0, CHUNK_OPTIONS.chunkSize);
    yield chunk;
    buffer = buffer.substring(CHUNK_OPTIONS.chunkSize - effectiveOverlap);
}
```

slices the buffer into non-overlapping windows and re-injects the trailing overlap characters back into the accumulator. This is a **sliding-window character chunker** — it does not attempt sentence-level segmentation (there is no NLP splitter dependency), which keeps the implementation dependency-light at the cost of occasionally producing hard splits mid-sentence.

The anchor of the "100 character / 20 overlap" values is the **granularity it affords**. At 100 characters, each chunk holds roughly 15–25 English words — short enough to avoid exceeding embedding model input limits, but long enough to capture a coherent phrase or sentence fragment. At 20-character overlap, approximately 20% of each chunk is shared with its neighbour, giving overlap-insensitive memory: if a user's query aligns with a concept that straddles a chunk boundary, the overlap on both sides maximises the chance that one of the neighbouring chunks carries the concept intact.

---

### 3b. The Critical Impact of Chunk Size and Batch Size on Retrieval Accuracy and System Efficiency

**Theoretical principle.**  
Chunk size and batch size are two distinct hyperparameters with contradictory optimisation objectives:

- **Larger chunks** carry more semantic context, reducing the risk that a relevant sentence is stranded in a partial chunk and therefore unavailable for retrieval. However, too-large chunks dilute the signal within the vector store (the embedding encodes many sentences, so the similarity score reflects only the overlap with the query's most salient terms).
- **Smaller chunks** provide higher resolution — each embedding is semantically focused — but increase total index size and risk fragmenting multi-sentence concepts.
- **batch size** does not change retrieval accuracy, but controls **embedding throughput** and **memory pressure**. Too small a batch wastes parallelism overhead; too large a batch risks memory exhaustion (embedding vectors are `768 × 4 = ~3 KB` per chunk in 32-bit float, so a batch of 1000 consumes ~3 MB before any other overhead).

**Implementation in this codebase.**  

```ts
CHUNK_OPTIONS = { chunkSize: 100, chunkOverlap: 20 }      // retrieval accuracy knob
BATCH_COLLECTOR_OPTIONS = { batchSize: 10 }                // throughput / memory knob
```

| Parameter | Value | Effect |
|---|---|---|
| `chunkSize` | 100 chars | Prioritises fine-grained semantic matching over long-form context |
| `chunkOverlap` | 20 chars | Reduces boundary artefacts by 20% redundancy |
| `batchSize` | 10 chunks | Parallelises 10 Ollama embedding calls per `for await` iteration |

The **100-character chunk size** is small. At the character level, a sentence in English averages ~80–120 characters. This means each chunk typically holds one sentence to one-and-a-half — high precision for factoid queries, potentially missing longer multi-sentence arguments. Increasing this to 400–600 characters (130–200 words, one paragraph) would be a natural first step in tuning for narrative or policy-style documents.

The **batch size of 10** is moderate. `Promise.all(batch.map(…))` at `embedder.ts:8` fans out 10 concurrent HTTP requests to the Ollama embedding endpoint simultaneously, saturating the Ollama server's concurrent-connection limit. Tuning this upward requires aligning with Ollama's concurrency budget; pushing it without knowledge of Ollama's thread pool will produce HTTP 429 errors or connection timeouts.

---

### 3c. How Chunking Methodologies Influence the Overall Retrieval Pipeline

**Theoretical principle.**  
Chunking is the "last mile" of the ingestion pipeline but the **first mile of the retrieval pipeline**. Every subsequent stage — embedding, storage, and retrieval — inherits the granularity and semantic integrity of the chunks. The pipeline does not "know" that two adjacent chunks describe the same event; it treats them as independent documents. The embedding model collapses each chunk into a single point in semantic space, so **chunk boundaries are semantic walls**: once a sentence is split across walls, the concept can only be recovered if the overlap on both sides happens to be sufficient.

**Implementation in this codebase — end-to-end impact.**

1. **Loading (`loader.ts`).** A `Readable` with `chunkSize=100` bytes produces raw byte-chunks. These may bisect words. The chunker below stitches them back, but if `fs.createReadStream` API returned content at byte-level accuracy this would be fine — in practice, for UTF-8 text, `chunkSize=100` bytes align with individual characters so it works correctly. Heavier binary or multi-byte encoding files (e.g. CJK) would be degraded without a proper stream decoder pre-layer.

2. **Chunking (`chunker.ts`).** The overlap buffer in `chunker.ts:16` (`buffer = buffer.substring(chunkSize - effectiveOverlap)`) is the mechanism that softens chunk boundaries. Without any overlap, a sentence boundary placed exactly at `char[100]` would be cut and query vectors for that sentence would miss it. The 20-character overlap ensures the subject verb of a split sentence is present in the tail, making it detectable at retrieval time.

3. **Batching (`batchCreator.ts`).** The batch collector aggregates single chunks into batches of 10 before passing them downstream. Without this, the embedder would issue one HTTP call per chunk. At `batchSize=1`, the Ollama server sees 10 serial rounds of latency; at `batchSize=10`, it processes them in parallel under one `Promise.all`, cutting embedding throughput time by approximately a factor of `batchSize` — subject to Ollama's thread limit.

4. **Embedding (`embedder.ts`).** The `Promise.all` call on the batch is where parallelism is introduced. If chunk boundaries are semantic walls, the embedding quality at each wall determines retrieval recall at that wall position.

5. **Storage (`store.ts`).** `client.upsert(..., {wait: true})` forces Qdrant to acknowledge persistence before the next batch proceeds. Without this, a dropped connection could silently lose batches without any indicator in the application.

**The cumulative cost of poor chunking.**

If `chunkSize` were increased to 2000 characters:
- Index storage would drop (fewer, longer chunks).
- Each embedding would encode broader context, reducing local precision.
- A mismatched multi-concept chunk might produce a misleadingly "average" vector, pulling away from unrelated queries for just one of the embedded concepts.

If `chunkOverlap` were set to 0:
- Every boundary would become a hard cut.
- Queries about overlapping concepts would see degraded recall at precisely the positions where embedding noise is highest (document boundaries).

The overlap percentage of 20% chosen here (`20 / 100 = 0.2`) is inline with literature suggesting 10–30% overlap as optimal for mixed-domain corpora with short retrieval windows — the codebase has made a substantiated, numerically correct choice here.
