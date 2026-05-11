import { QdrantClient } from "@qdrant/js-client-rest";
import type { EmbeddedChunk, QdrantPayload } from "../types.ts/ingest.js";
import { STORE_OPTIONS } from "../constants/index.js";

export async function storeEmbeddings(
    stream:AsyncGenerator<EmbeddedChunk[]>,
){
    const client = new QdrantClient({
        url:STORE_OPTIONS.qdrantUrl
    })
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
}