export type EmbeddingVector = number[];

export interface EmbeddedChunk {
  content: string;
  embedding: EmbeddingVector;
}
export interface QdrantPayload {
  content: string;
}
