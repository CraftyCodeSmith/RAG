import { QdrantClient } from "@qdrant/js-client-rest";
import { getDbClient } from "../db/vectorStore.js";
//code to create collection in qdrant
//to be ran for once only

export const createCollection=async()=>{
  const client = getDbClient()
await client.createCollection("documents", {
  vectors: {
    size: 768,
    distance: "Cosine",
  },
});
}