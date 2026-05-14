import { getDbClient } from "../db/vectorStore.js";
import { STORE_OPTIONS } from "../constants/index.js";

export interface RetrievedChunk {
    id: string;
    content: {};
    score: number;
}

export interface RetrievalResult {
  query: string;
  chunks: RetrievedChunk[];
}


export const retrieveRelevantChunks = async ({
  queryEmbedding,
  query,
  topK = 3,
}: {
  queryEmbedding: number[];
  query: string;
  topK?: number;
}): Promise<RetrievalResult> =>{
    const client=getDbClient()
     try {
    const response = await client.search(STORE_OPTIONS.collectionName, {
      vector: queryEmbedding,
      limit: topK,
      with_payload: true,
    });
    console.log(response)
    const chunks = response.map((point) => {

      return {
        id: String(point.id),
        content: point.payload?.content ?? "",
        score: point.score,
      };
    });

    return {
      query,
      chunks,
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Qdrant retrieval failed: ${error.message}`);
    }

    throw new Error("Unknown qdrant retrieval error");
  }
};