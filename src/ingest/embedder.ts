import { EMBEDDER_OPTIONS } from "../constants/index.js"
import type { EmbeddedChunk, EmbeddingVector } from "../types.ts/ingest.js"

async function generateEmbedding(text:string):Promise<EmbeddingVector>{
    const response = await fetch("http://localhost:11434/api/embeddings",{
        method:"POST",
        headers:{
            "Content-Type":"application/json"
        },
        body:JSON.stringify({
            model:EMBEDDER_OPTIONS.model,
            prompt:EMBEDDER_OPTIONS.prompt + text
        })
    })
    if(!response.ok){
        throw new Error(
              `Ollama API request failed with status ${response.status}`
        )
    }
    const data:{
        embedding:number[]
    }=(await response.json())
    return data.embedding
}

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