/**
 * Dex → Tana daily contact sync
 *
 * Pass 1: Enrich existing Tana #Person nodes from Dex (by Dex ID; email fallback for first link)
 * Pass 2: Create new Tana nodes for Dex contacts not yet in Tana
 *
 * Dex is source of truth. Runs daily via launchd.
 */

import { config as loadEnv } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { readFileSync, writeFileSync, existsSync, appendFileSync } from "fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

loadEnv({ path: resolve(process.env.HOME!, "Code/.env.shared") });

const DEX_API_KEY = process.env.DEX_API_KEY;
if (!DEX_API_KEY) {
  console.error("ERROR: DEX_API_KEY not set in ~/Code/.env.shared");
  process.exit(1);
}

const CONFIG_PATH = resolve(__dirname, "config.json");
const MANIFEST_PATH = resolve(__dirname, "manifest.json"); // dexId → tanaNodeId
const LOG_PATH = resolve(__dirname, "sync.log");
const DEX_BASE = "https://api.prod.getdex.com";

// Hardcoded Tana schema IDs
const TANA = {
  personTagId: "nZpkld7dQskJ",
  emailFieldId: "k9O0oY4fMfJr",
  companyFieldId: "Q04zHyehJE6O",
  linkedinFieldId: "aysf-gg5hGSz",
  companyTagId: "dOyQBmskUrt9",
  contactsFolderId: "IoJcLKFPYLjJ", // Library > Google Calendar Contacts
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface SyncConfig {
  dexIdFieldId: string;
  dexProfileUrlFieldId: string;
}

interface TanaNode {
  id: string;
  name: string;
}

interface DexContact {
  id: string;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  company?: string;
  job_title?: string;
  linkedin?: string;
  contact_emails?: Array<{ email: string }>;
}

// ─── Logging ──────────────────────────────────────────────────────────────────

function log(msg: string) {
  const line = `${new Date().toISOString()} ${msg}`;
  console.log(line);
  appendFileSync(LOG_PATH, line + "\n");
}

function trimLog() {
  if (!existsSync(LOG_PATH)) return;
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const lines = readFileSync(LOG_PATH, "utf8")
    .split("\n")
    .filter((l) => {
      const m = l.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/);
      return m ? new Date(m[1]).getTime() > cutoff : false;
    });
  writeFileSync(LOG_PATH, lines.join("\n") + (lines.length ? "\n" : ""));
}

// ─── Config ───────────────────────────────────────────────────────────────────

function loadConfig(): Partial<SyncConfig> {
  return existsSync(CONFIG_PATH)
    ? JSON.parse(readFileSync(CONFIG_PATH, "utf8"))
    : {};
}

function saveConfig(cfg: Partial<SyncConfig>) {
  writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
}

// ─── Manifest: dexId → tanaNodeId (prevents duplicate creation across runs) ──

function loadManifest(): Map<string, string> {
  if (!existsSync(MANIFEST_PATH)) return new Map();
  try {
    const obj = JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as Record<string, string>;
    return new Map(Object.entries(obj));
  } catch {
    return new Map();
  }
}

function saveManifest(manifest: Map<string, string>) {
  writeFileSync(MANIFEST_PATH, JSON.stringify(Object.fromEntries(manifest), null, 2));
}

// ─── Tana MCP Client ──────────────────────────────────────────────────────────

class TanaClient {
  private client: Client;
  private mcpToken: string | undefined;

  constructor() {
    this.client = new Client({ name: "dex-tana-sync", version: "1.0.0" });
    this.mcpToken = process.env.TANA_MCP_TOKEN;
  }

  async connect() {
    const transport = new StreamableHTTPClientTransport(
      new URL("http://localhost:8262/mcp"),
      this.mcpToken
        ? { requestInit: { headers: { Authorization: `Bearer ${this.mcpToken}` } } }
        : undefined
    );
    await this.client.connect(transport);
  }

  private async reconnect() {
    try {
      await this.client.close();
    } catch {}
    // SDK doesn't support reconnecting the same Client instance after close;
    // create a fresh Client and reconnect.
    this.client = new Client({ name: "dex-tana-sync", version: "1.0.0" });
    await this.connect();
  }

  private async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    try {
      const result = await this.client.callTool({ name, arguments: args });
      if (result.isError) {
        throw new Error(`Tana tool '${name}' error: ${JSON.stringify(result.content)}`);
      }
      const content = result.content[0];
      return content.type === "text" ? content.text : JSON.stringify(content);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      // Reconnect on transport errors (dropped connection, "Already connected to transport", etc.)
      const isTransportError =
        msg.includes("Already connected to a transport") ||
        msg.includes("Already connected to transport") ||
        msg.includes("Connection closed") ||
        msg.includes("ECONNREFUSED") ||
        msg.includes("Streamable HTTP error");
      if (!isTransportError) throw e;

      log(`  ↺ Transport error on '${name}', reconnecting...`);
      await new Promise((r) => setTimeout(r, 500));
      await this.reconnect();

      // Retry once after reconnect
      const result = await this.client.callTool({ name, arguments: args });
      if (result.isError) {
        throw new Error(`Tana tool '${name}' error (after reconnect): ${JSON.stringify(result.content)}`);
      }
      const content = result.content[0];
      return content.type === "text" ? content.text : JSON.stringify(content);
    }
  }

  async searchNodes(query: object, limit = 100): Promise<TanaNode[]> {
    const raw = await this.callTool("search_nodes", { query, limit: Math.min(limit, 100) });
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  async readNode(nodeId: string, maxDepth = 2): Promise<string> {
    return this.callTool("read_node", { nodeId, maxDepth });
  }

  async trashNode(nodeId: string): Promise<void> {
    await this.callTool("trash_node", { nodeId });
  }

  async getChildren(nodeId: string, limit = 200, offset = 0): Promise<{ children: TanaNode[]; total: number; hasMore: boolean }> {
    const raw = await this.callTool("get_children", { nodeId, limit, offset });
    try { return JSON.parse(raw); } catch { return { children: [], total: 0, hasMore: false }; }
  }

  async getAllChildren(nodeId: string): Promise<TanaNode[]> {
    const all: TanaNode[] = [];
    let offset = 0;
    do {
      const { children, hasMore } = await this.getChildren(nodeId, 200, offset);
      all.push(...children);
      offset += children.length;
      if (!hasMore) break;
      if (all.length % 2000 === 0) log(`  ... loaded ${all.length} folder children`);
    } while (true);
    return all;
  }

  async editNode(nodeId: string, oldName: string, newName: string): Promise<void> {
    await this.callTool("edit_node", {
      nodeId,
      name: { old_string: oldName, new_string: newName },
    });
  }

  async setFieldContent(nodeId: string, attributeId: string, content: string): Promise<void> {
    await this.callTool("set_field_content", { nodeId, attributeId, content });
  }

  async importTanaPaste(parentNodeId: string, content: string): Promise<void> {
    await this.callTool("import_tana_paste", { parentNodeId, content });
  }

  async addFieldToTag(tagId: string, name: string, dataType: string): Promise<void> {
    await this.callTool("add_field_to_tag", { tagId, name, dataType });
  }

  async getTagSchema(tagId: string): Promise<string> {
    return this.callTool("get_tag_schema", { tagId });
  }
}

// ─── Dex API Client ───────────────────────────────────────────────────────────

class DexClient {
  private headers: Record<string, string>;

  constructor(apiKey: string) {
    this.headers = {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    };
  }

  private async get<T>(path: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(DEX_BASE + path);
    if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    const res = await fetch(url.toString(), { headers: this.headers });
    if (!res.ok) throw new Error(`Dex GET ${path} → ${res.status}: ${await res.text()}`);
    const json = await res.json() as { error: boolean; data: T };
    return json.data;
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(DEX_BASE + path, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Dex POST ${path} → ${res.status}: ${await res.text()}`);
    const json = await res.json() as { error: boolean; data: T };
    return json.data;
  }

  async getContact(id: string): Promise<DexContact | null> {
    try {
      return await this.get<DexContact>(`/v1/contacts/${id}`);
    } catch {
      return null;
    }
  }

  /** Batch email lookup — returns map of email → contact.
   *  API: POST /v1/contacts/by-emails  body: { emails: string[] }
   *  Response: data is DexContact[] (contacts matching any queried email) */
  async searchByEmails(emails: string[]): Promise<Map<string, DexContact>> {
    if (emails.length === 0) return new Map();
    try {
      const contacts = await this.post<DexContact[]>("/v1/contacts/by-emails", { emails });
      const map = new Map<string, DexContact>();
      if (!Array.isArray(contacts)) return map;
      for (const contact of contacts) {
        for (const emailObj of contact.contact_emails ?? []) {
          const e = emailObj.email.toLowerCase();
          if (emails.some((q) => q.toLowerCase() === e) && !map.has(e)) {
            map.set(e, contact);
          }
        }
      }
      return map;
    } catch {
      return new Map();
    }
  }

  async listAllContacts(): Promise<DexContact[]> {
    const all: DexContact[] = [];
    let cursor: string | undefined;
    do {
      const params: Record<string, string> = { take: "100" };
      if (cursor) params.cursor = cursor;
      const result = await this.get<{ items: DexContact[]; nextCursor?: string }>(
        "/v1/contacts/",
        params
      );
      all.push(...(result.items ?? []));
      cursor = result.nextCursor;
    } while (cursor);
    return all;
  }

  getDisplayName(c: DexContact): string | null {
    const raw =
      c.full_name ||
      [c.first_name, c.last_name].filter(Boolean).join(" ").trim() ||
      null;
    if (!raw || isEmailLike(raw) || raw === ".") return null;
    // Filter degenerate names: every alphabetic word is ≤1 char (e.g. "AM .", "J Z", "A.")
    const alphaWords = raw.split(/\s+/).map((w) => w.replace(/[^a-zA-Z]/g, "")).filter(Boolean);
    if (alphaWords.length === 0 || alphaWords.every((w) => w.length <= 1)) return null;
    // Normalize all-caps or all-lowercase
    if (raw === raw.toUpperCase() || raw === raw.toLowerCase()) {
      return raw
        .split(" ")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(" ");
    }
    return raw;
  }

  /** Merge groups of duplicate contacts. Primary (index 0) is kept; rest deleted. */
  async mergeContacts(groups: string[][]): Promise<number> {
    if (groups.length === 0) return 0;
    let merged = 0;
    // Dex accepts multiple groups per call — batch in groups of 50
    for (let i = 0; i < groups.length; i += 50) {
      const batch = groups.slice(i, i + 50);
      try {
        await this.post<{ mergedContactIds: string[] }>("/v1/contacts/merge", {
          contactIds: batch,
        });
        merged += batch.reduce((sum, g) => sum + g.length - 1, 0);
      } catch (e) {
        log(`  ⚠ Merge batch failed: ${e}`);
      }
    }
    return merged;
  }

  /** Batch email lookup — returns map of email → all matching contacts */
  async searchAllByEmails(emails: string[]): Promise<Map<string, DexContact[]>> {
    const result = new Map<string, DexContact[]>();
    if (emails.length === 0) return result;
    for (let i = 0; i < emails.length; i += 50) {
      const batch = emails.slice(i, i + 50);
      try {
        const contacts = await this.post<DexContact[]>("/v1/contacts/by-emails", { emails: batch });
        if (!Array.isArray(contacts)) continue;
        for (const contact of contacts) {
          for (const emailObj of contact.contact_emails ?? []) {
            const e = emailObj.email.toLowerCase();
            if (batch.some((q) => q.toLowerCase() === e)) {
              if (!result.has(e)) result.set(e, []);
              result.get(e)!.push(contact);
            }
          }
        }
      } catch {}
    }
    return result;
  }

  /** linkedin field in Dex is a bare handle (e.g. "johnsmith") — build full URL */
  linkedinUrl(handle: string | null | undefined): string | null {
    if (!handle) return null;
    if (handle.includes("linkedin.com")) {
      return handle.startsWith("https://") ? handle : `https://${handle}`;
    }
    return `https://www.linkedin.com/in/${handle}`;
  }

  profileUrl(contactId: string): string {
    return `https://getdex.com/appv3/contacts/${contactId}`;
  }
}

// ─── Serial async helper (Tana MCP doesn't support concurrent requests) ──────

async function runSerial<T, R>(items: T[], fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (const item of items) {
    results.push(await fn(item));
  }
  return results;
}

// ─── Node text parsing ────────────────────────────────────────────────────────

function isEmailLike(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function parseNodeName(text: string): string | null {
  const m = text.match(/^- (.+?) #/m);
  return m ? m[1].trim() : null;
}

function parseField(text: string, fieldName: string): string | null {
  const escaped = fieldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = text.match(new RegExp(`\\*\\*${escaped}\\*\\*:\\s*(.+?)(?:\\s*<!--|$)`, "im"));
  return m ? m[1].trim() : null;
}

// ─── Setup: ensure Dex ID and Dex Profile fields exist on #Person ─────────────

async function ensureFields(tana: TanaClient): Promise<SyncConfig> {
  let cfg = loadConfig();

  if (!cfg.dexIdFieldId) {
    log("Creating 'Dex ID' plain-text field on #Person tag...");
    await tana.addFieldToTag(TANA.personTagId, "Dex ID", "plain");
    const schema = await tana.getTagSchema(TANA.personTagId);
    const m = schema.match(/\*\*Dex ID\*\*\s+\(id:([^)]+)\)/);
    if (!m) throw new Error("Could not find Dex ID field ID after creation. Schema:\n" + schema);
    cfg.dexIdFieldId = m[1].trim();
    saveConfig(cfg);
    log(`  Dex ID field created: ${cfg.dexIdFieldId}`);
  }

  if (!cfg.dexProfileUrlFieldId) {
    log("Creating 'Dex Profile' URL field on #Person tag...");
    await tana.addFieldToTag(TANA.personTagId, "Dex Profile", "url");
    const schema = await tana.getTagSchema(TANA.personTagId);
    const m = schema.match(/\*\*Dex Profile\*\*\s+\(id:([^)]+)\)/);
    if (!m) throw new Error("Could not find Dex Profile field ID after creation. Schema:\n" + schema);
    cfg.dexProfileUrlFieldId = m[1].trim();
    saveConfig(cfg);
    log(`  Dex Profile field created: ${cfg.dexProfileUrlFieldId}`);
  }

  return cfg as SyncConfig;
}

// ─── Email helpers ────────────────────────────────────────────────────────────

/** Parse all email values already set on a node from its read_node text */
function parseExistingEmails(text: string): Set<string> {
  const emails = new Set<string>();
  // Email field lines look like: **Email**: foo@bar.com
  // There can be multiple — each on its own child line
  const re = /\*\*Email\*\*:\s*([^\s<!--]+)/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    emails.add(m[1].trim().toLowerCase());
  }
  return emails;
}

// ─── Write Dex data to a Tana node ───────────────────────────────────────────

async function writeContactToNode(
  tana: TanaClient,
  nodeId: string,
  nodeText: string,
  contact: DexContact,
  dex: DexClient,
  cfg: SyncConfig
): Promise<{ renamed: boolean; linkedIn: boolean; company: boolean; linked: boolean; emails: number }> {
  const result = { renamed: false, linkedIn: false, company: false, linked: false, emails: 0 };

  // Dex ID — store if not set
  const existingDexId = parseField(nodeText, "Dex ID");
  if (!existingDexId) {
    await tana.setFieldContent(nodeId, cfg.dexIdFieldId, contact.id);
    result.linked = true;
  }

  // Dex Profile URL — store if not set
  const existingProfile = parseField(nodeText, "Dex Profile");
  if (!existingProfile) {
    await tana.setFieldContent(nodeId, cfg.dexProfileUrlFieldId, dex.profileUrl(contact.id));
  }

  // Name — rename if Dex has a real name and it differs
  const currentName = parseNodeName(nodeText) ?? "";
  const dexName = dex.getDisplayName(contact);
  if (dexName && dexName !== currentName && currentName) {
    try {
      await tana.editNode(nodeId, currentName, dexName);
      result.renamed = true;
    } catch (e) {
      log(`  ⚠ Rename failed for node ${nodeId}: ${e}`);
    }
  }

  // Emails — add any from Dex not already in Tana
  const existingEmails = parseExistingEmails(nodeText);
  const dexEmails = (contact.contact_emails ?? []).map((e) => e.email.toLowerCase());
  for (const email of dexEmails) {
    if (!existingEmails.has(email)) {
      await tana.importTanaPaste(nodeId, `- [[^${TANA.emailFieldId}]]:: ${email}`);
      result.emails++;
    }
  }

  // LinkedIn — update if Dex has a profile URL and it differs
  const currentLinkedin = parseField(nodeText, "LinkedIn") ?? "";
  const li = dex.linkedinUrl(contact.linkedin);
  if (li && li !== currentLinkedin) {
    await tana.setFieldContent(nodeId, TANA.linkedinFieldId, li);
    result.linkedIn = true;
  }

  // Company — update if Dex has one and it differs
  const currentCompany = parseField(nodeText, "Company")
    ?.replace(/#Company.*$/, "")
    .trim();
  if (contact.company && contact.company !== currentCompany) {
    // Search for existing #Company node first
    let companyNodeId: string | null = null;
    try {
      const found = await tana.searchNodes(
        { and: [{ hasType: TANA.companyTagId }, { textContains: contact.company }] },
        5
      );
      const exact = found.find(
        (c) => c.name.toLowerCase() === contact.company!.toLowerCase()
      );
      if (exact) companyNodeId = exact.id;
    } catch {}

    if (companyNodeId) {
      await tana.setFieldContent(nodeId, TANA.companyFieldId, companyNodeId);
    } else {
      await tana.importTanaPaste(
        nodeId,
        `- [[^${TANA.companyFieldId}]]:: ${contact.company} #[[^${TANA.companyTagId}]]`
      );
    }
    result.company = true;
  }

  return result;
}

// ─── PASS 0: Dex dedup — merge email-named contacts into named contacts ──────

async function pass0(
  dex: DexClient,
  allContacts: DexContact[]
): Promise<{ groups: number; eliminated: number }> {
  log("=== Pass 0: Deduplicating Dex contacts ===");

  // Find contacts whose full_name IS an email address
  const emailNamedContacts = allContacts.filter(
    (c) => c.full_name && isEmailLike(c.full_name)
  );
  log(`  Found ${emailNamedContacts.length} email-named contacts in Dex`);

  if (emailNamedContacts.length === 0) {
    log("  Pass 0 done: nothing to merge");
    return { groups: 0, eliminated: 0 };
  }

  // Look up all contacts sharing each email
  const emails = emailNamedContacts.map((c) => c.full_name!);
  const emailToContacts = await dex.searchAllByEmails(emails);

  const mergeGroups: string[][] = [];

  for (const emailContact of emailNamedContacts) {
    const email = emailContact.full_name!.toLowerCase();
    const sharing = emailToContacts.get(email) ?? [];

    // All contacts sharing this email (including the email-named one itself)
    const all = sharing.some((c) => c.id === emailContact.id)
      ? sharing
      : [emailContact, ...sharing];

    if (all.length < 2) continue; // nothing to merge

    // Pick primary: prefer contact with a real name; fall back to email contact itself
    const named = all.filter((c) => dex.getDisplayName(c) !== null);
    const primary = named[0] ?? emailContact;
    const secondaries = all.filter((c) => c.id !== primary.id);

    if (secondaries.length === 0) continue;

    mergeGroups.push([primary.id, ...secondaries.map((c) => c.id)]);
    log(`  → Merge: "${dex.getDisplayName(primary) ?? primary.full_name}" absorbs ${secondaries.length} duplicate(s) for ${email}`);
  }

  if (mergeGroups.length === 0) {
    log("  Pass 0 done: no duplicates found");
    return { groups: 0, eliminated: 0 };
  }

  const eliminated = await dex.mergeContacts(mergeGroups);
  log(`  Pass 0 done: ${mergeGroups.length} merge groups, ${eliminated} contacts eliminated`);
  return { groups: mergeGroups.length, eliminated };
}

// ─── PASS 1: Enrich existing Tana nodes ──────────────────────────────────────

async function pass1(
  tana: TanaClient,
  dex: DexClient,
  cfg: SyncConfig
): Promise<{ updated: number; linked: number; notInDex: number; errors: number }> {
  log("=== Pass 1: Enriching existing Tana #Person nodes ===");

  const nodes = await tana.searchNodes({ hasType: TANA.personTagId }, 100);
  log(`  Found ${nodes.length} #Person nodes`);

  const stats = { updated: 0, linked: 0, notInDex: 0, errors: 0 };

  // Collect nodes that need email-based lookup (no Dex ID yet)
  // We batch-read them first, then bulk-query Dex
  const nodeData: Array<{ node: TanaNode; text: string; dexId: string | null }> = [];

  for (const node of nodes) {
    const text = await tana.readNode(node.id, 2);
    nodeData.push({ node, text, dexId: parseField(text, "Dex ID") });
  }

  // Batch email lookup for unlinked nodes
  const unlinkedEmails = nodeData
    .filter((d) => !d.dexId && isEmailLike(d.node.name))
    .map((d) => d.node.name);

  const emailMap = await dex.searchByEmails(unlinkedEmails);
  log(`  Dex matched ${emailMap.size}/${unlinkedEmails.length} unlinked emails`);

  // Process all nodes sequentially (Tana MCP requires serial calls)
  for (const { node, text, dexId } of nodeData) {
    try {
      let contact: DexContact | null = null;

      if (dexId) {
        contact = await dex.getContact(dexId);
      } else if (isEmailLike(node.name)) {
        contact = emailMap.get(node.name.toLowerCase()) ?? null;
      }

      if (!contact) {
        stats.notInDex++;
        continue;
      }

      const r = await writeContactToNode(tana, node.id, text, contact, dex, cfg);
      stats.updated++;
      if (r.linked) stats.linked++;
    } catch (e) {
      log(`  ✗ Error on node ${node.id} (${node.name}): ${e}`);
      stats.errors++;
    }
  }

  log(
    `  Pass 1 done: ${stats.updated} updated (${stats.linked} newly linked), ` +
      `${stats.notInDex} not in Dex, ${stats.errors} errors`
  );
  return stats;
}

// ─── PASS 2: Create Tana nodes for Dex contacts not yet in Tana ───────────────

async function pass2(
  tana: TanaClient,
  dex: DexClient,
  cfg: SyncConfig,
  allDexContacts: DexContact[]
): Promise<{ created: number; enriched: number; skipped: number; errors: number }> {
  log("=== Pass 2: Creating/enriching Tana nodes from Dex ===");
  log(`  Processing ${allDexContacts.length} Dex contacts`);

  // Load the persistent manifest (dexId → tanaNodeId). This is the primary source
  // of "already created" knowledge — unlike search_nodes which is capped at 100,
  // the manifest covers every node ever created by this script.
  const manifest = loadManifest();
  log(`  Manifest has ${manifest.size} known Dex IDs`);

  // Also scan the 100-node search window to catch nodes created outside this script
  // (e.g. manually, or via the dex-hydrate skill) and seed/repair the manifest.
  const knownDexIds = new Set<string>(manifest.keys());
  const emailToNode = new Map<string, { node: TanaNode; text: string }>();

  const tanaNodes = await tana.searchNodes({ hasType: TANA.personTagId }, 100);
  for (const node of tanaNodes) {
    const text = await tana.readNode(node.id, 2);
    const dexId = parseField(text, "Dex ID");
    if (dexId) {
      knownDexIds.add(dexId);
      if (!manifest.has(dexId)) manifest.set(dexId, node.id); // seed from Tana scan
    }
    if (isEmailLike(node.name)) emailToNode.set(node.name.toLowerCase(), { node, text });
  }

  const stats = { created: 0, enriched: 0, skipped: 0, errors: 0 };

  for (const contact of allDexContacts) {
    try {
      // Skip if already linked by Dex ID (manifest is the authoritative check)
      if (knownDexIds.has(contact.id)) {
        stats.skipped++;
        continue;
      }

      const primaryEmail = contact.contact_emails?.[0]?.email?.toLowerCase();
      const emailEntry = primaryEmail ? emailToNode.get(primaryEmail) : undefined;

      if (emailEntry) {
        // Existing email-named Tana node — enrich it instead of creating a new one
        await writeContactToNode(tana, emailEntry.node.id, emailEntry.text, contact, dex, cfg);
        emailToNode.delete(primaryEmail!); // prevent double-enriching
        knownDexIds.add(contact.id);
        manifest.set(contact.id, emailEntry.node.id);
        stats.enriched++;
        log(`  ↑ Enriched: ${primaryEmail} → ${dex.getDisplayName(contact) ?? primaryEmail}`);
        continue;
      }

      // Skip nameless contacts (no real name AND no email to use as fallback)
      const name = dex.getDisplayName(contact) ?? primaryEmail;
      if (!name) {
        stats.skipped++;
        continue;
      }

      let paste = `- ${name} #[[^${TANA.personTagId}]]\n`;
      paste += `  - [[^${cfg.dexIdFieldId}]]:: ${contact.id}\n`;
      paste += `  - [[^${cfg.dexProfileUrlFieldId}]]:: ${dex.profileUrl(contact.id)}\n`;

      const li = dex.linkedinUrl(contact.linkedin);
      if (li) paste += `  - [[^${TANA.linkedinFieldId}]]:: ${li}\n`;
      if (contact.company) paste += `  - [[^${TANA.companyFieldId}]]:: ${contact.company} #[[^${TANA.companyTagId}]]\n`;
      for (const emailObj of contact.contact_emails ?? []) {
        paste += `  - [[^${TANA.emailFieldId}]]:: ${emailObj.email}\n`;
      }

      await tana.importTanaPaste(TANA.contactsFolderId, paste);
      knownDexIds.add(contact.id);
      // Note: importTanaPaste doesn't return the new node ID, so we store a sentinel
      // to mark it as created. Next Pass 1 run will find and update the manifest with
      // the real node ID via the Dex ID field lookup.
      manifest.set(contact.id, "created");
      stats.created++;
    } catch (e) {
      log(`  ✗ Error on contact ${contact.id}: ${e}`);
      stats.errors++;
    }
  }

  // Persist manifest after each run
  saveManifest(manifest);
  log(`  Manifest saved: ${manifest.size} entries`);

  log(
    `  Pass 2 done: ${stats.created} created, ${stats.enriched} enriched, ${stats.skipped} skipped, ${stats.errors} errors`
  );
  return stats;
}

// ─── PASS 3: Resolve email-stub nodes (email name, no Dex ID) ─────────────────
//
// For each Tana #Person whose name IS an email and has no Dex ID:
//   1. Look up the email in Dex
//   2. If found and Dex contact has a real name, find the named Tana node
//   3. Add the email to the named node's Email field (if not already there)
//   4. Trash the email-stub node

async function pass3(
  tana: TanaClient,
  dex: DexClient,
  cfg: SyncConfig,
  allNodes: TanaNode[]
): Promise<{ resolved: number; skipped: number; errors: number }> {
  log("=== Pass 3: Resolving email-stub #Person nodes ===");

  // Filter to email-named nodes with no Dex ID from the full node list
  // We need to read each to check for Dex ID — batch by reading in sequence
  const emailStubs: Array<{ node: TanaNode; text: string }> = [];
  let checked = 0;
  for (const node of allNodes) {
    if (!isEmailLike(node.name)) continue;
    checked++;
    const text = await tana.readNode(node.id, 2);
    const dexId = parseField(text, "Dex ID");
    if (!dexId) emailStubs.push({ node, text });
  }
  log(`  Checked ${checked} email-named nodes, ${emailStubs.length} have no Dex ID`);

  if (emailStubs.length === 0) {
    log("  Pass 3 done: nothing to resolve");
    return { resolved: 0, skipped: 0, errors: 0 };
  }

  // Batch-lookup all stub emails in Dex
  const emails = emailStubs.map((s) => s.node.name);
  const dexByEmail = await dex.searchByEmails(emails);
  log(`  Dex matched ${dexByEmail.size}/${emails.length} stub emails`);

  const stats = { resolved: 0, skipped: 0, errors: 0 };

  // Build a name → node map from allNodes for fast lookup of named counterparts
  const nameToNode = new Map<string, TanaNode>();
  for (const node of allNodes) {
    if (!isEmailLike(node.name)) {
      nameToNode.set(node.name.toLowerCase().trim(), node);
    }
  }

  for (const { node: stubNode, text: stubText } of emailStubs) {
    try {
      const contact = dexByEmail.get(stubNode.name.toLowerCase());
      if (!contact) {
        stats.skipped++;
        continue;
      }

      const displayName = dex.getDisplayName(contact);
      if (!displayName) {
        // No real name in Dex — enrich the stub itself (rename + Dex ID + fields)
        await writeContactToNode(tana, stubNode.id, stubText, contact, dex, cfg);
        stats.resolved++;
        log(`  ↑ Enriched stub (no named counterpart): ${stubNode.name}`);
        continue;
      }

      // Find the named counterpart in Tana
      const namedNode = nameToNode.get(displayName.toLowerCase().trim());
      if (!namedNode) {
        // Named node not in our folder scan — try a Tana search
        const found = await tana.searchNodes(
          { and: [{ hasType: TANA.personTagId }, { textContains: displayName }] },
          10
        );
        const exact = found.find(
          (n) => n.name.toLowerCase() === displayName.toLowerCase() && !isEmailLike(n.name)
        );
        if (!exact) {
          // No named counterpart anywhere — enrich the stub itself
          await writeContactToNode(tana, stubNode.id, stubText, contact, dex, cfg);
          stats.resolved++;
          log(`  ↑ Enriched stub (named node not found): ${stubNode.name}`);
          continue;
        }
        // Found via search — add to map for future lookups
        nameToNode.set(displayName.toLowerCase().trim(), exact);
      }

      const targetNode = nameToNode.get(displayName.toLowerCase().trim())!;

      // Add email to named node if not already there
      const namedText = await tana.readNode(targetNode.id, 2);
      const existingEmails = parseExistingEmails(namedText);
      if (!existingEmails.has(stubNode.name.toLowerCase())) {
        await tana.importTanaPaste(targetNode.id, `- [[^${TANA.emailFieldId}]]:: ${stubNode.name}`);
        log(`  + Added email ${stubNode.name} → "${displayName}"`);
      }

      // Trash the email stub
      await tana.trashNode(stubNode.id);
      log(`  ✓ Resolved: trashed "${stubNode.name}" (merged into "${displayName}")`);
      stats.resolved++;
    } catch (e) {
      log(`  ✗ Error on stub ${stubNode.name}: ${e}`);
      stats.errors++;
    }
  }

  log(`  Pass 3 done: ${stats.resolved} resolved, ${stats.skipped} skipped (not in Dex), ${stats.errors} errors`);
  return stats;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  trimLog();
  log("=== Dex → Tana sync started ===");

  const tana = new TanaClient();
  await tana.connect();

  const dex = new DexClient(DEX_API_KEY!);
  const cfg = await ensureFields(tana);

  // Fetch all Dex contacts once — shared across passes
  log("Fetching all Dex contacts...");
  let allDexContacts = await dex.listAllContacts();
  log(`  ${allDexContacts.length} contacts in Dex`);

  const p0 = await pass0(dex, allDexContacts);

  // Re-fetch after merges so passes 1 & 2 see clean data
  if (p0.eliminated > 0) {
    log("Re-fetching Dex contacts after merges...");
    allDexContacts = await dex.listAllContacts();
    log(`  ${allDexContacts.length} contacts after dedup`);
  }

  const p1 = await pass1(tana, dex, cfg);
  const p2 = await pass2(tana, dex, cfg, allDexContacts);

  // Pass 3: enumerate all nodes from the folder for email-stub resolution
  log("Enumerating contacts folder for Pass 3...");
  const allTanaNodes = await tana.getAllChildren(TANA.contactsFolderId);
  log(`  ${allTanaNodes.length} nodes in folder`);
  const p3 = await pass3(tana, dex, cfg, allTanaNodes);

  log(
    `=== Sync complete | ` +
      `P0: ${p0.groups} merged | ` +
      `P1: ${p1.updated} updated, ${p1.linked} newly linked | ` +
      `P2: ${p2.created} created, ${p2.enriched} enriched | ` +
      `P3: ${p3.resolved} stubs resolved ===`
  );
}

main().catch((e) => {
  log(`FATAL: ${e}`);
  process.exit(1);
});
