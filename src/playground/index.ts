import { QdrantClient } from "@qdrant/js-client-rest";
//code to create collection in qdrant
//to be ran for once only

const client = new QdrantClient({
  url: "http://localhost:6333",
});

await client.createCollection("documents", {
  vectors: {
    size: 1024,
    distance: "Cosine",
  },
});