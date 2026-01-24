import http from "http";
import { readFile, stat, readdir } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const host = "127.0.0.1";
const port = 8080;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { "Cache-Control": "no-cache", ...headers });
  res.end(body);
}

function isSafePath(targetPath) {
  const relative = path.relative(root, targetPath);
  return !relative.startsWith("..") && !path.isAbsolute(relative);
}

async function resolvePath(urlPath) {
  const cleanPath = decodeURIComponent(urlPath.split("?")[0]).replace(/\/+$/, "");
  const candidate = cleanPath === "" ? "/" : cleanPath;
  const absolute = path.join(root, candidate);
  if (!isSafePath(absolute)) {
    return null;
  }

  try {
    const stats = await stat(absolute);
    if (stats.isDirectory()) {
      const indexPath = path.join(absolute, "index.html");
      return { filePath: indexPath };
    }
    return { filePath: absolute };
  } catch {
    const htmlCandidate = path.join(root, `${candidate}.html`);
    if (!isSafePath(htmlCandidate)) {
      return null;
    }
    try {
      const stats = await stat(htmlCandidate);
      if (stats.isFile()) {
        return { filePath: htmlCandidate };
      }
    } catch {
      return null;
    }
  }

  return null;
}

const server = http.createServer(async (req, res) => {
  if (!req.url) {
    send(res, 400, "Bad Request");
    return;
  }

  if (req.url === "/__list") {
    try {
      const entries = await readdir(root, { withFileTypes: true });
      const listing = entries
        .filter((entry) => entry.name.endsWith(".html") || entry.isDirectory())
        .map((entry) => entry.name)
        .sort()
        .join("\n");
      send(res, 200, listing, { "Content-Type": "text/plain; charset=utf-8" });
    } catch (error) {
      send(res, 500, `Error: ${error.message}`);
    }
    return;
  }

  const resolved = await resolvePath(req.url);
  if (!resolved) {
    send(res, 404, "Not Found");
    return;
  }

  try {
    const data = await readFile(resolved.filePath);
    const ext = path.extname(resolved.filePath).toLowerCase();
    const contentType = mimeTypes[ext] || "application/octet-stream";
    send(res, 200, data, { "Content-Type": contentType });
  } catch (error) {
    send(res, 500, `Error: ${error.message}`);
  }
});

server.listen(port, host, () => {
  // eslint-disable-next-line no-console
  console.log(`Static server running at http://${host}:${port}`);
});
