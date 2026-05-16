import type { EmbeddedChunk, QdrantPayload } from "../types.ts/ingest.js";
import { STORE_OPTIONS } from "../constants/index.js";
import { getDbClient } from "../db/vectorStore.js";

export async function storeEmbeddings(
    stream:AsyncGenerator<EmbeddedChunk[]>,
){
    const client = getDbClient()
    
    for await (const batch of stream){
        const points = batch.map((chunk,index)=>({
            id:crypto.randomUUID(),
            vector:chunk.embedding,
            payload:{
                content:chunk.content
            } satisfies QdrantPayload
        }));
        await client.upsert(STORE_OPTIONS.collectionName,{
            wait:true,
            points
        })
    }
    console.log("::Done")
}