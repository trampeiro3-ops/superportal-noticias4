import { build } from 'esbuild';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ASSET_FILES } from '../cloud-functions/lib/generated-assets.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'dist');

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

for (const file of ['index.html', 'favicon.svg', 'site.webmanifest']) {
  await cp(path.join(root, file), path.join(output, file));
}
for (const directory of ['admin', 'politica-editorial', 'privacidade', 'termos']) {
  await cp(path.join(root, directory), path.join(output, directory), { recursive: true });
}

// The article template is generated inside the original asset bundle rather than
// stored as a standalone file. Publish it as a normal Pages static asset.
const articleTemplate = ASSET_FILES['/article-template.html'];
if (typeof articleTemplate !== 'string' || !articleTemplate.trim()) {
  throw new Error('O template de matéria /article-template.html não foi encontrado.');
}
await writeFile(path.join(output, 'article-template.html'), articleTemplate, 'utf8');

await build({
  entryPoints: [path.join(root, 'cloudflare/_worker.js')],
  outfile: path.join(output, '_worker.js'),
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  treeShaking: true,
  minify: true,
  legalComments: 'none',
  sourcemap: false,
  logLevel: 'info'
});

const workerCode = await readFile(path.join(output, '_worker.js'), 'utf8');
if (!workerCode.includes('TURSO_DATABASE_URL') || !workerCode.includes('/api/cron')) {
  throw new Error('O Worker gerado não contém as rotas/configurações esperadas.');
}
console.log(`Build Cloudflare Pages concluído: ${output}`);
