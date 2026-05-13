interface ILoaderConfig {
  chunkSize: number;
  encoding: "utf-8";
}
interface IChunkConfig {
  chunkSize: number;
  chunkOverlap: number;
}
interface IBatchCollectorConfig {
  batchSize: number;
}
interface IStoreConfig {
  collectionName: string;
  qdrantUrl: string;
}
interface IEmbedderConfig {
  model: string;
  prompt: string;
}

export const SUPPORTED_EXTENSIONS: ReadonlyArray<string> = [".txt", ".md"];

export const LOADER_OPTIONS: Readonly<ILoaderConfig> = {
  chunkSize: 100,
  encoding: "utf-8",
};

export const CHUNK_OPTIONS: Readonly<IChunkConfig> = {
  chunkSize: 100,
  chunkOverlap: 20,
};

export const BATCH_COLLECTOR_OPTIONS: Readonly<IBatchCollectorConfig> = {
  batchSize: 10,
};
export const EMBEDDER_OPTIONS: Readonly<IEmbedderConfig> = {
  model: "nomic-embed-text",
  prompt: `Prepare this text for semantic search embedding.

Rules:

* Preserve all factual information.
* Keep names, numbers, dates, policies, prices, and technical details intact.
* Remove irrelevant formatting noise.
* Do not invent information.
* Do not explain or answer questions.
* Return clean searchable text only.

Text: 
`,
};
export const STORE_OPTIONS: Readonly<IStoreConfig> = {
  collectionName: "documents",
  qdrantUrl: "http://localhost:6333", //localhost
};
