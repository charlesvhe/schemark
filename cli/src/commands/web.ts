import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, normalize, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { runMeta } from "./meta.js";

export interface WebOptions {
  port: number;
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".ico": "image/x-icon",
};

function getStaticDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidate = join(here, "static");
  if (existsSync(candidate)) return candidate;
  return join(here, "..", "static");
}

function serveStatic(staticDir: string, req: IncomingMessage, res: ServerResponse): void {
  let urlPath = req.url || "/";
  if (urlPath === "/") urlPath = "/index.html";

  const decoded = decodeURIComponent(urlPath);
  const normalized = normalize(decoded);
  if (normalized.includes("..")) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  const filePath = join(staticDir, normalized);
  const rel = relative(staticDir, filePath);
  if (rel.startsWith("..") || !existsSync(filePath) || statSync(filePath).isDirectory()) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  const ext = extname(filePath);
  const mime = MIME[ext];
  if (!mime) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  res.writeHead(200, { "Content-Type": mime });
  res.end(readFileSync(filePath));
}
function handleApiMeta(dir: string, res: ServerResponse): void {
  try {
    const result = runMeta(dir);
    const body = JSON.stringify({ files: result.files, skipped: result.skipped });
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(body);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: msg }));
  }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

function getOpenCommand(): { cmd: string; args: (f: string) => string[] } {
  const p = process.platform;
  if (p === "darwin") return { cmd: "open", args: (f) => [f] };
  if (p === "win32") return { cmd: "cmd", args: (f) => ["/c", "start", "", f] };
  return { cmd: "xdg-open", args: (f) => [f] };
}

async function handleApiOpen(dir: string, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const raw = await readBody(req);
  let parsed: { path?: string };
  try {
    parsed = JSON.parse(raw);
  } catch {
    res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "invalid JSON" }));
    return;
  }

  const relPath = parsed.path;
  if (!relPath || typeof relPath !== "string") {
    res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "invalid path" }));
    return;
  }

  const absDir = resolve(dir);
  const absFile = resolve(absDir, relPath);
  const rel = relative(absDir, absFile);
  if (rel.startsWith("..") || !existsSync(absFile)) {
    res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "invalid path" }));
    return;
  }

  const { cmd, args } = getOpenCommand();
  const child = spawn(cmd, args(absFile), { stdio: ["ignore", "ignore", "pipe"] });
  let stderr = "";
  child.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
  child.on("close", (code) => {
    if (code === 0) {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: true }));
    } else {
      res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: stderr.trim() || `exit code ${code}` }));
    }
  });
  child.on("error", (err) => {
    res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: err.message }));
  });
}

export function runWeb(dir: string, options: WebOptions): Promise<{ stop: () => void }> {
  const staticDir = getStaticDir();
  const port = options.port;

  return new Promise((resolvePromise, rejectPromise) => {
    const server = createServer((req, res) => {
      const url = req.url || "/";
      if (req.method === "GET" && url === "/api/meta") {
        handleApiMeta(dir, res);
      } else if (req.method === "POST" && url === "/api/open") {
        handleApiOpen(dir, req, res).catch(() => {
          if (!res.headersSent) {
            res.writeHead(500);
            res.end(JSON.stringify({ error: "internal error" }));
          }
        });
      } else if (req.method === "GET") {
        serveStatic(staticDir, req, res);
      } else {
        res.writeHead(404);
        res.end("Not found");
      }
    });

    server.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        process.stderr.write(`端口 ${port} 已被占用，请换用 -p 指定其他端口\n`);
        rejectPromise(err);
      } else {
        rejectPromise(err);
      }
    });

    server.listen(port, "127.0.0.1", () => {
      const url = `http://localhost:${port}`;
      process.stdout.write(`Schemark web on ${url}\n`);
      const { cmd, args } = getOpenCommand();
      spawn(cmd, args(url), { stdio: "ignore", detached: true }).unref();
      resolvePromise({ stop: () => server.close() });
    });
  });
}
