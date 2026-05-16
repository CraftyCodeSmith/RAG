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
  model: 'nomic-embed-text' | 'mxbai-embed-large';
  prompt: string;
}
interface IRetrieveOptions {
  model:'llama3' | 'mistral-small' | 'qwen2.5:32b',
  prompt:(context:string,question:string)=>string
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
  qdrantUrl: `${process.env.QDRANT_URL}`, 
};
export const RETRIVE_OPTIONS: Readonly<IRetrieveOptions>={
  model:'llama3',
  prompt:(context,question)=>{
     const prompt=  `
You are a retrieval-augmented assistant.

Answer the question using ONLY the provided context.

Rules:
- Return ONLY the final answer.
- Do NOT mention chunks, context, sources, or explanations.
- Do NOT say "Based on the provided context".
- Keep the answer concise and direct.
- If the answer is not in the context, return exactly:
I could not find the answer in the provided context.

CONTEXT:
${context}

QUESTION:
${question}

FINAL ANSWER:
`.trim();
return prompt;
  }
}
