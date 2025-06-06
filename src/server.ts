import express from "express";
import axios from "axios";
import dotenv from "dotenv";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { z } from "zod";

// Load environment (base URL and port)
dotenv.config();

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const MEETGEEK_BASE_URL = process.env.MEETGEEK_BASE_URL;
if (!MEETGEEK_BASE_URL) {
  console.error("Missing MEETGEEK_BASE_URL environment variable");
  process.exit(1);
}

// Initialize Express and MCP server
const app = express();
const mcpServer = new McpServer({ name: "MeetgeekMCP", version: "1.0.0" });

// SSE and message endpoints
const SSE_PATH = "/sse";
const MESSAGE_PATH = "/messages";

// Transport will carry apiKey from client
let transport: SSEServerTransport & { apiKey?: string };

// SSE handshake: no auth here, client sends Authorization on POST
app.get(SSE_PATH, (req, res) => {
  transport = new SSEServerTransport(MESSAGE_PATH, res);
  transport.onerror = (err) => console.error("SSE error:", err);
  transport.onclose = () => console.log("SSE connection closed");
  // transport.start();
  mcpServer.connect(transport).catch(console.error);
});

// Handle incoming MCP messages; extract API key from Authorization header
app.post(MESSAGE_PATH, express.json(), async (req, res) => {
  if (!transport) {
    return res.status(400).json({ error: "SSE transport not initialized" });
  }
  const auth = req.header("authorization");
  if (auth?.startsWith("Bearer ")) {
    transport.apiKey = auth.slice(7);
  }
  try {
    await transport.handlePostMessage(req, res, req.body);
  } catch (err) {
    console.error("Error handling post message:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// === MCP Resources using dynamic API key ===

// 1. List Meetings (tool)
mcpServer.tool(
  "listMeetings",
  {
    cursor: z.string().optional(),
    limit: z.number().optional()
  },
  async (args, extra) => {
    const key = transport.apiKey!;
    const { cursor, limit } = args as { cursor?: string; limit?: number };
    const resp = await axios.get(
      `${MEETGEEK_BASE_URL}/v1/meetings`,
      { headers: { Authorization: `Bearer ${key}` }, params: { cursor, limit } }
    );
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(resp.data)
        }
      ]
    };
  }
);

// 1. List Meetings
mcpServer.tool(
  "meetings",
  {
    cursor: z.string().optional(),
    limit: z.number().optional()
  },
  async (args, extra) => {
    const key = transport.apiKey!;
    const { cursor, limit } = args as { cursor?: string; limit?: number };
    const resp = await axios.get(
      `${MEETGEEK_BASE_URL}/v1/meetings`,
      { headers: { Authorization: `Bearer ${key}` }, params: { cursor, limit } }
    );
    return { content: [{ type: "text", text: JSON.stringify(resp.data) }] };
  }
);

// 2. Meeting Details
mcpServer.tool(
  "meetingDetails",
  {
    meetingId: z.string()
  },
  async (args, extra) => {
    const key = transport.apiKey!;
    const { meetingId } = args as { meetingId: string };
    const resp = await axios.get(
      `${MEETGEEK_BASE_URL}/v1/meetings/${meetingId}`,
      { headers: { Authorization: `Bearer ${key}` } }
    );
    return { content: [{ type: "text", text: JSON.stringify(resp.data) }] };
  }
);

// 3. Transcript
mcpServer.tool(
  "transcript",
  {
    meetingId: z.string(),
    cursor: z.string().optional(),
    limit: z.number().optional()
  },
  async (args, extra) => {
    const key = transport.apiKey!;
    const { meetingId, cursor, limit } = args as { meetingId: string; cursor?: string; limit?: number };
    const resp = await axios.get(
      `${MEETGEEK_BASE_URL}/v1/meetings/${meetingId}/transcript`,
      { headers: { Authorization: `Bearer ${key}` }, params: { cursor, limit } }
    );
    return { content: [{ type: "text", text: JSON.stringify(resp.data) }] };
  }
);

// 4. Highlights
mcpServer.tool(
  "highlights",
  {
    meetingId: z.string()
  },
  async (args, extra) => {
    const key = transport.apiKey!;
    const { meetingId } = args as { meetingId: string };
    const resp = await axios.get(
      `${MEETGEEK_BASE_URL}/v1/meetings/${meetingId}/highlights`,
      { headers: { Authorization: `Bearer ${key}` } }
    );
    return { content: [{ type: "text", text: JSON.stringify(resp.data) }] };
  }
);

// 5. Summary
mcpServer.tool(
  "summary",
  {
    meetingId: z.string()
  },
  async (args, extra) => {
    const key = transport.apiKey!;
    const { meetingId } = args as { meetingId: string };
    const resp = await axios.get(
      `${MEETGEEK_BASE_URL}/v1/meetings/${meetingId}/summary`,
      { headers: { Authorization: `Bearer ${key}` } }
    );
    return { content: [{ type: "text", text: JSON.stringify(resp.data) }] };
  }
);

// 6. Team Meetings
mcpServer.tool(
  "teamMeetings",
  {
    teamId: z.string(),
    cursor: z.string().optional(),
    limit: z.number().optional()
  },
  async (args, extra) => {
    const key = transport.apiKey!;
    const { teamId, cursor, limit } = args as { teamId: string; cursor?: string; limit?: number };
    const resp = await axios.get(
      `${MEETGEEK_BASE_URL}/v1/teams/${teamId}/meetings`,
      { headers: { Authorization: `Bearer ${key}` }, params: { cursor, limit } }
    );
    return { content: [{ type: "text", text: JSON.stringify(resp.data) }] };
  }
);

// Upload Recording tool remains unchanged
mcpServer.tool(
  "uploadRecording",
  {
    download_url: z.string(),
    language_code: z.string(),
    template_name: z.optional(z.string()),
  },
  async (args) => {
    const key = transport.apiKey!;
    const { download_url, language_code, template_name } = args as { download_url: string; language_code: string; template_name?: string };
    const resp = await axios.post(
      `${MEETGEEK_BASE_URL}/v1/upload`,
      { download_url, language_code, template_name },
      { headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" } }
    );
    return { content: [{ type: "text", text: JSON.stringify(resp.data) }] };
  }
);

// Start server
app.listen(PORT, () => {
  console.log(`🚀 MCP server running at http://localhost:${PORT}${SSE_PATH}`);
});