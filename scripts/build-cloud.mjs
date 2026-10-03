import { build } from 'esbuild';
import { mkdirSync, cpSync, readFileSync } from 'node:fs';
mkdirSync('dist/client', { recursive: true });
cpSync('dist/index.html', 'dist/client/index.html');
cpSync('dist/assets', 'dist/client/assets', { recursive: true });
await build({ entryPoints: ['server/cloudWorker.ts'], outfile: 'dist/server/index.js', bundle: true, format: 'esm', platform: 'browser', target: 'es2022', minify: true });
// Only code and frontend assets are packaged. Keys and local run databases stay outside dist.
mkdirSync('dist/.openai', { recursive: true });
cpSync('.openai/hosting.json', 'dist/.openai/hosting.json');
const manifest = JSON.parse(readFileSync('.openai/hosting.json', 'utf8'));
if (manifest.d1 !== 'DB') throw new Error('The cloud build needs the DB binding.');
console.log('Cloud server and frontend built.');
