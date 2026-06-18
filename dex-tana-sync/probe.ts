import { config as loadEnv } from "dotenv";
import { resolve } from "path";
loadEnv({ path: resolve(process.env.HOME!, "Code/.env.shared") });

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const client = new Client({ name: "probe2", version: "1.0.0" });
const transport = new StreamableHTTPClientTransport(
  new URL("http://localhost:8262/mcp"),
  { requestInit: { headers: { Authorization: "Bearer " + process.env.TANA_MCP_TOKEN } } }
);
await client.connect(transport);

// #Person tag schema
const r1 = await client.callTool({ name: "get_tag_schema", arguments: { tagId: "nZpkld7dQskJ" } });
console.log("=== #Person Schema ===");
console.log((r1.content[0] as {text:string}).text);

// Read a person node that has email set (Neil Patel was enriched)
const r2 = await client.callTool({ name: "search_nodes", arguments: {
  query: { and: [{ hasType: "nZpkld7dQskJ" }, { textContains: "Neil Patel" }] }, limit: 5
}});
const nodes = JSON.parse((r2.content[0] as {text:string}).text) as Array<{id:string;name:string}>;
console.log("\n=== Neil Patel nodes ===");
for (const n of nodes.slice(0,2)) {
  const r3 = await client.callTool({ name: "read_node", arguments: { nodeId: n.id, maxDepth: 2 } });
  console.log(`\n${n.name} (${n.id}):`);
  console.log((r3.content[0] as {text:string}).text);
}

await client.close();
