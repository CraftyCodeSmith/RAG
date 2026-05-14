import { callResponseModel, generateEmbedding } from "../api/models.js"
import { buildPrompt } from "./prompt.js"
import { retrieveRelevantChunks } from "./retrieve.js"

export const RAG=async(query:string)=>{
    const queryEmbedding=await generateEmbedding(query)
    const relevantChunks=await retrieveRelevantChunks({query,queryEmbedding})
    const prompt=buildPrompt(relevantChunks);
    const llmResponse=await callResponseModel(prompt)
    return llmResponse;

}