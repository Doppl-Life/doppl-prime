import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type ServerResponse } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publishedDir = path.join(root, 'published');

const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.ico', 'image/x-icon'],
]);

type Args = { host: string; port: number };

function parseArgs(argv: string[]): Args {
  const args: Args = {
    host: process.env.HOST || '0.0.0.0',
    port: Number(process.env.PORT || 4318),
  };

  for (const arg of argv) {
    if (arg === '--') {
      continue;
    } else if (arg.startsWith('--host=')) {
      args.host = arg.slice('--host='.length) || args.host;
    } else if (arg.startsWith('--port=')) {
      const port = Number(arg.slice('--port='.length));
      if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`Bad --port value: ${arg}`);
      args.port = port;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function send(response: ServerResponse, status: number, body: string, contentType = 'text/plain; charset=utf-8'): void {
  response.writeHead(status, { 'content-type': contentType });
  response.end(body);
}

function fileForUrl(rawUrl: string | undefined): string | undefined {
  const url = new URL(rawUrl || '/', 'http://localhost');
  const decoded = decodeURIComponent(url.pathname);
  const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  const candidate = path.resolve(publishedDir, relative);
  if (candidate !== publishedDir && !candidate.startsWith(`${publishedDir}${path.sep}`)) return undefined;
  if (existsSync(candidate) && statSync(candidate).isDirectory()) return path.join(candidate, 'index.html');
  return candidate;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const server = createServer((request, response) => {
    if (request.url === '/health') {
      send(response, 200, 'ok');
      return;
    }

    const filePath = fileForUrl(request.url);
    if (!filePath || !existsSync(filePath) || !statSync(filePath).isFile()) {
      send(response, 404, 'not found');
      return;
    }

    response.writeHead(200, {
      'content-type': mimeTypes.get(path.extname(filePath).toLowerCase()) || 'application/octet-stream',
    });
    if (request.method === 'HEAD') {
      response.end();
      return;
    }
    createReadStream(filePath).pipe(response);
  });

  server.listen(args.port, args.host, () => {
    console.log(`Serving ${publishedDir} at http://${args.host}:${args.port}/`);
  });
}

await main();
