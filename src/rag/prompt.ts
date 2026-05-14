
import { RETRIVE_OPTIONS } from "../constants/index.js";
import type { RetrievedChunk } from "./retrieve.js"; 

export const buildPrompt = ({
  query,
  chunks,
}: {
  query: string;
  chunks: RetrievedChunk[];
}): string => {
  const context = chunks
    .map(
      (chunk, index) =>
        `[Chunk ${index + 1}]
${chunk.content}`
    )
    .join("\n\n");

  const prompt =RETRIVE_OPTIONS.prompt(context,query)

  return  prompt ;
};