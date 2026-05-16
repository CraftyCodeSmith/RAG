import { QdrantClient } from "@qdrant/js-client-rest";
//code to create collection in qdrant
//to be ran for once only

const client = new QdrantClient({
  url: `${process.env.QDRANT_URL}`,
});

await client.createCollection("documents", {
  vectors: {
    size: 768,
    distance: "Cosine",
  },
});