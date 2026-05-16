import { EMBEDDER_OPTIONS } from "../constants/index.js";
import type { EmbeddingVector } from "../types.ts/ingest.js";

export interface GenerationResult {
  answer: string;
}

interface OllamaResponse {
  response: string;
}

export const callResponseModel = async (prompt: string) => {
  try {
    const response = await fetch(`${process.env.OLLAMA_URL}/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama3",
        prompt: prompt,
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama API failed: ${response.status}`);
    }

    const data = (await response.json()) as OllamaResponse;

    return {
      answer: data.response,
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Generation failed: ${error.message}`);
    }

    throw new Error("Unknown generation error");
  }
};

export async function generateEmbedding(text:string):Promise<EmbeddingVector>{
  try {
    const response = await fetch(`${process.env.OLLAMA_URL}/embeddings`,{
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
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Generation failed: ${error.message}`);
    }

    throw new Error("Unknown generation error");
  }
}

