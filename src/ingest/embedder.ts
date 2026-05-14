import { generateEmbedding } from "../api/models.js";
import type { EmbeddedChunk, EmbeddingVector } from "../types.ts/ingest.js"

export async function* createEmbedder(
    stream:AsyncGenerator<string[]>
):AsyncGenerator<EmbeddedChunk[]>{
    for await (const batch of stream){
        const embeddedBatch : EmbeddedChunk[]= await Promise.all(
            batch.map(async (chunk):Promise<EmbeddedChunk>=>{
                const embedding = await generateEmbedding(chunk);
                return{
                    content:chunk,
                    embedding
                }
            })
        )
        yield embeddedBatch
    }
}