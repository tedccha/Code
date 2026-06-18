/**
 * Tana duplicate #Person node cleanup
 *
 * Two kinds of duplicates arise when sync runs multiple times and search_nodes
 * is capped at 100 nodes:
 *
 * Type A — Named + Named: same Dex ID appears on 2+ nodes
 *   (e.g. 3× "Shivani Stadvec" each with Dex ID 6a2aed7a...)
 *
 * Type B — Email + Named: an old email-named node that was never enriched,
 *   plus a new named node for the same person
 *   (e.g. "shivani@clariumhealth.com" + "Shivani Stadvec")
 *
 * Strategy (fast):
 *   1. Paginate ALL children of the contacts folder via get_children — just names + IDs
 *   2. Group by exact name → Type A candidates (name seen 2+ times)
 *   3. Collect email-named nodes → look up each in Dex to find canonical name
 *   4. For Type B: search Tana for the named counterpart by Dex display name
 *   5. Read only the small candidate sets to determine which node to keep
 *
 * Run:     npm run cleanup-dupes
 * Dry-run: npm run cleanup-dupes -- --dry-run
 */

import { config as loadEnv } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { readFileSync, existsSync } from "fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(process.env.HOME!, "Code/.env.shared") });

const DEX_API_KEY = process.env.DEX_API_KEY!;
const DEX_BASE = "https://api.prod.getdex.com";
const CONFIG_PATH = resolve(__dirname, "config.json");

const TANA = {
  personTagId: "nZpkld7dQskJ",
  contactsFolderId: "IoJcLKFPYLjJ",
};

interface SyncConfig { dexIdFieldId: string; dexProfileUrlFieldId: string; }
interface TanaNode { id: string; name: string; }
interface DexContact {
  id: string; full_name?: string; first_name?: string; last_name?: string;
  contact_emails?: Array<{ email: string }>;
}

// ─── Tana MCP Client ──────────────────────────────────────────────────────────

class TanaClient {
  private client: Client;
  private mcpToken = process.env.TANA_MCP_TOKEN;

  constructor() { this.client = new Client({ name: "dex-tana-cleanup", version: "1.0.0" }); }

  async connect() {
    const transport = new StreamableHTTPClientTransport(
      new URL("http://localhost:8262/mcp"),
      this.mcpToken ? { requestInit: { headers: { Authorization: `Bearer ${this.mcpToken}` } } } : undefined
    );
    await this.client.connect(transport);
  }

  private async reconnect() {
    try { await this.client.close(); } catch {}
    this.client = new Client({ name: "dex-tana-cleanup", version: "1.0.0" });
    await this.connect();
  }

  private async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    try {
      const result = await this.client.callTool({ name, arguments: args });
      if (result.isError) throw new Error(`Tana '${name}': ${JSON.stringify(result.content)}`);
      const c = result.content[0];
      return c.type === "text" ? c.text : JSON.stringify(c);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      const isTransport = msg.includes("Already connected to") || msg.includes("Connection closed") || msg.includes("Streamable HTTP");
      if (!isTransport) throw e;
      console.log(`  ↺ Transport error on '${name}', reconnecting...`);
      await new Promise((r) => setTimeout(r, 500));
      await this.reconnect();
      const result = await this.client.callTool({ name, arguments: args });
      if (result.isError) throw new Error(`Tana '${name}' (retry): ${JSON.stringify(result.content)}`);
      const c = result.content[0];
      return c.type === "text" ? c.text : JSON.stringify(c);
    }
  }

  async getChildren(nodeId: string, limit = 200, offset = 0): Promise<{ children: TanaNode[]; total: number; hasMore: boolean }> {
    const raw = await this.callTool("get_children", { nodeId, limit, offset });
    try { return JSON.parse(raw); } catch { return { children: [], total: 0, hasMore: false }; }
  }

  async getAllChildren(nodeId: string): Promise<TanaNode[]> {
    const all: TanaNode[] = [];
    let offset = 0;
    let total = 0;
    do {
      const { children, total: t, hasMore } = await this.getChildren(nodeId, 200, offset);
      all.push(...children);
      total = t;
      offset += children.length;
      if (!hasMore) break;
      if (all.length % 2000 === 0) console.log(`  ... loaded ${all.length}/${total} children`);
    } while (true);
    return all;
  }

  async searchNodes(query: object): Promise<TanaNode[]> {
    const raw = await this.callTool("search_nodes", { query, limit: 100 });
    try { return JSON.parse(raw); } catch { return []; }
  }

  async readNode(nodeId: string): Promise<string> {
    return this.callTool("read_node", { nodeId, maxDepth: 1 });
  }

  async trashNode(nodeId: string): Promise<void> {
    await this.callTool("trash_node", { nodeId });
  }
}

// ─── Dex Client ───────────────────────────────────────────────────────────────

class DexClient {
  private headers = { Authorization: `Bearer ${DEX_API_KEY}`, "Content-Type": "application/json" };

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(DEX_BASE + path, { method: "POST", headers: this.headers, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`Dex POST ${path} → ${res.status}`);
    const json = await res.json() as { error: boolean; data: T };
    return json.data;
  }

  async lookupByEmails(emails: string[]): Promise<Map<string, DexContact>> {
    if (emails.length === 0) return new Map();
    const map = new Map<string, DexContact>();
    for (let i = 0; i < emails.length; i += 50) {
      const batch = emails.slice(i, i + 50);
      try {
        // API returns DexContact[] (contacts that have any of the queried emails)
        const contacts = await this.post<DexContact[]>("/v1/contacts/by-emails", { emails: batch });
        if (!Array.isArray(contacts)) continue;
        for (const contact of contacts) {
          // Map each matching email to this contact
          for (const emailObj of contact.contact_emails ?? []) {
            const e = emailObj.email.toLowerCase();
            if (batch.some((b) => b.toLowerCase() === e)) {
              if (!map.has(e)) map.set(e, contact);
            }
          }
        }
      } catch {}
    }
    return map;
  }

  getDisplayName(c: DexContact): string | null {
    const raw = c.full_name || [c.first_name, c.last_name].filter(Boolean).join(" ").trim() || null;
    if (!raw || isEmailLike(raw) || raw === ".") return null;
    const alpha = raw.split(/\s+/).map((w) => w.replace(/[^a-zA-Z]/g, "")).filter(Boolean);
    if (alpha.length === 0 || alpha.every((w) => w.length <= 1)) return null;
    return raw;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isEmailLike(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function parseField(text: string, fieldName: string): string | null {
  const escaped = fieldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = text.match(new RegExp(`\\*\\*${escaped}\\*\\*:\\s*(.+?)(?:\\s*<!--|$)`, "im"));
  return m ? m[1].trim() : null;
}

function isPersonNode(text: string): boolean {
  return text.includes("#Person");
}

// Prefer: has Dex ID > named (not email) > has LinkedIn > has Company
function scoreNode(text: string, name: string): number {
  let score = 0;
  if (parseField(text, "Dex ID")) score += 100;
  if (!isEmailLike(name)) score += 50;
  if (parseField(text, "Dex Profile")) score += 10;
  if (parseField(text, "LinkedIn")) score += 5;
  if (parseField(text, "Company")) score += 5;
  return score;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const cfg: SyncConfig = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
  const DRY_RUN = process.argv.includes("--dry-run");
  if (DRY_RUN) console.log("[DRY RUN] No changes will be made.\n");

  const tana = new TanaClient();
  await tana.connect();
  const dex = new DexClient();

  // ── Step 1: Enumerate ALL children of the contacts folder ─────────────────
  console.log(`Enumerating all children of contacts folder (${TANA.contactsFolderId})...`);
  const allNodes = await tana.getAllChildren(TANA.contactsFolderId);
  console.log(`${allNodes.length} total nodes in contacts folder\n`);

  // ── Step 2: Group by exact lowercased name → find Type A (name duplicates) ─
  const nameGroups = new Map<string, TanaNode[]>();
  const emailNodes: TanaNode[] = [];

  for (const node of allNodes) {
    const key = node.name.toLowerCase().trim();
    if (!nameGroups.has(key)) nameGroups.set(key, []);
    nameGroups.get(key)!.push(node);
    if (isEmailLike(node.name)) emailNodes.push(node);
  }

  const typeAGroups = [...nameGroups.values()].filter((g) => g.length >= 2 && !isEmailLike(g[0].name));
  console.log(`Type A candidates (name appears 2+ times): ${typeAGroups.length} groups`);
  console.log(`Email-named nodes: ${emailNodes.length}`);

  // ── Step 3: Resolve Type A — read each duplicate group, pick best node ────
  const trashQueue: Array<{ nodeId: string; name: string; keepId: string; keepName: string; reason: string }> = [];
  const trashedIds = new Set<string>(); // avoid double-queuing

  console.log("\n--- Type A: Named duplicates ---");
  for (const group of typeAGroups) {
    const scored: Array<{ node: TanaNode; text: string; score: number }> = [];
    for (const n of group) {
      try {
        const text = await tana.readNode(n.id);
        if (isPersonNode(text)) scored.push({ node: n, text, score: scoreNode(text, n.name) });
      } catch {}
    }
    if (scored.length < 2) continue;
    scored.sort((a, b) => b.score - a.score);
    const keep = scored[0];
    for (const dupe of scored.slice(1)) {
      if (trashedIds.has(dupe.node.id)) continue;
      trashedIds.add(dupe.node.id);
      trashQueue.push({ nodeId: dupe.node.id, name: dupe.node.name, keepId: keep.node.id, keepName: keep.node.name, reason: "Type A" });
      console.log(`  [A] "${dupe.node.name}" (${dupe.node.id}) → trash  [keep: ${keep.node.id}]`);
    }
  }

  // ── Step 4: Resolve Type B — email nodes with a named counterpart ─────────
  console.log("\n--- Type B: Email stubs with named counterpart ---");

  // Batch-lookup all email node names in Dex
  const emailAddresses = emailNodes.map((n) => n.name);
  console.log(`Looking up ${emailAddresses.length} email nodes in Dex...`);
  const dexByEmail = await dex.lookupByEmails(emailAddresses);
  console.log(`Dex matched ${dexByEmail.size} emails\n`);

  for (const emailNode of emailNodes) {
    if (trashedIds.has(emailNode.id)) continue;
    const contact = dexByEmail.get(emailNode.name.toLowerCase());
    if (!contact) continue;

    const displayName = dex.getDisplayName(contact);
    if (!displayName) continue; // email contact with no real name — leave it

    // Check if a named node exists for this person
    const namedKey = displayName.toLowerCase().trim();
    const namedCandidates = nameGroups.get(namedKey) ?? [];

    // Also search Tana in case named node is outside our folder
    if (namedCandidates.length === 0) {
      const found = await tana.searchNodes({ and: [{ hasType: TANA.personTagId }, { textContains: displayName }] });
      const exact = found.filter((n) => n.name.toLowerCase() === namedKey && !isEmailLike(n.name));
      namedCandidates.push(...exact);
    }

    const namedNode = namedCandidates.find((n) => !trashedIds.has(n.id) && n.id !== emailNode.id);
    if (!namedNode) continue;

    trashedIds.add(emailNode.id);
    trashQueue.push({ nodeId: emailNode.id, name: emailNode.name, keepId: namedNode.id, keepName: namedNode.name, reason: "Type B" });
    console.log(`  [B] "${emailNode.name}" (${emailNode.id}) → trash  [keep: "${namedNode.name}" ${namedNode.id}]`);
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  const typeACount = trashQueue.filter((t) => t.reason === "Type A").length;
  const typeBCount = trashQueue.filter((t) => t.reason === "Type B").length;
  console.log(`\n─── Summary ───`);
  console.log(`Type A (named duplicates): ${typeACount} to trash`);
  console.log(`Type B (email stubs): ${typeBCount} to trash`);
  console.log(`Total: ${trashQueue.length}`);

  if (trashQueue.length === 0) { console.log("Nothing to clean up."); return; }

  if (DRY_RUN) {
    console.log("\n[DRY RUN] Would trash:");
    trashQueue.forEach((t) => console.log(`  "${t.name}" (${t.nodeId})`));
    return;
  }

  // ── Trash ─────────────────────────────────────────────────────────────────
  console.log("\nTrashing duplicates...");
  let trashed = 0, errors = 0;
  for (const item of trashQueue) {
    try {
      await tana.trashNode(item.nodeId);
      console.log(`  ✓ Trashed "${item.name}" [${item.reason}] → kept "${item.keepName}"`);
      trashed++;
    } catch (e) {
      console.log(`  ✗ Failed "${item.name}": ${e}`);
      errors++;
    }
  }
  console.log(`\nDone: ${trashed} trashed, ${errors} errors`);
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
