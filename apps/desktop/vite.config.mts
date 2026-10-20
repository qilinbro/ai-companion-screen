import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const configDir = path.dirname(fileURLToPath(import.meta.url));
const studyRoot = path.resolve(configDir, '../../vendor/grok-study/replica');

const CONTENT_TYPES: Record<string, string> = {
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

function contentTypeOf(file: string): string {
  return CONTENT_TYPES[path.extname(file)] ?? 'application/octet-stream';
}

function studyVendorPlugin(): Plugin {
  return {
    name: 'companion-study-vendor',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__study', (req, res, next) => {
        if (!req.url) {
          next();
          return;
        }

        let relative: string;
        try {
          relative = decodeURIComponent((req.url.split('?')[0] ?? '').replace(/^\/+/, ''));
        } catch {
          res.statusCode = 400;
          res.end('bad request');
          return;
        }

        if (relative.length === 0) {
          next();
          return;
        }

        const file = path.resolve(studyRoot, relative);
        if (!file.startsWith(studyRoot + path.sep)) {
          res.statusCode = 403;
          res.end('forbidden');
          return;
        }

        fs.stat(file, (error, stat) => {
          if (error || !stat.isFile()) {
            next();
            return;
          }

          res.setHeader('Content-Type', contentTypeOf(file));
          res.setHeader('Cache-Control', 'no-store');
          fs.createReadStream(file)
            .on('error', () => {
              if (!res.headersSent) res.statusCode = 500;
              res.end('read error');
            })
            .pipe(res);
        });
      });
    },
  };
}

function cspPlugin(): Plugin {
  return {
    name: 'companion-csp',
    enforce: 'pre',
    transformIndexHtml: {
      order: 'pre',
      handler(html, context) {
        const dev = Boolean(context.server);
        const csp = dev
          ? "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws://127.0.0.1:5173 ws://localhost:5173"
          : "default-src 'self' file:; script-src 'self' file:; style-src 'self' file:; img-src 'self' data: file:; connect-src 'none'; object-src 'none'; base-uri 'none'";

        return {
          html,
          tags: [
            {
              tag: 'meta',
              attrs: {
                'http-equiv': 'Content-Security-Policy',
                content: csp,
              },
              injectTo: 'head-prepend',
            },
          ],
        };
      },
    },
  };
}

function stripCrossoriginPlugin(): Plugin {
  return {
    name: 'companion-strip-crossorigin',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        // Electron loads the production build from file://; Vite's crossorigin
        // attributes can turn local module/style requests into CORS failures.
        return html.replace(/\scrossorigin(?:="[^"]*")?/g, '');
      },
    },
  };
}

export default defineConfig({
  root: configDir,
  base: './',
  appType: 'mpa',
  plugins: [react(), studyVendorPlugin(), cspPlugin(), stripCrossoriginPlugin()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(configDir, 'character.html'),
    },
  },
});
