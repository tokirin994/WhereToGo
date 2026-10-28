import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {createRequire} from 'node:module'
import {pathToFileURL} from 'node:url'
const require=createRequire(import.meta.url)
const packageRoot = new URL('./',pathToFileURL(require.resolve('pdfjs-dist/package.json')))
const publicRoot = new URL('../public/pdfjs/', import.meta.url)
const directories = ['cmaps', 'iccs', 'standard_fonts', 'wasm']
const version = JSON.parse(readFileSync(new URL('package.json', packageRoot), 'utf8')).version
const stamp = new URL('asset-version.json', publicRoot)
let prepared = false
try { prepared = JSON.parse(readFileSync(stamp, 'utf8')).version === version && [...directories, 'pdf.worker.min.mjs'].every(name => existsSync(new URL(name, publicRoot))) } catch {}
// Avoid rewriting every static asset during a dev session: Vite would reload the page.
if (!prepared) {
  mkdirSync(publicRoot, { recursive: true })
  for (const name of directories) {
    cpSync(fileURLToPath(new URL(name, packageRoot)), fileURLToPath(new URL(name, publicRoot)), { recursive: true })
  }
  cpSync(fileURLToPath(new URL('build/pdf.worker.min.mjs', packageRoot)), fileURLToPath(new URL('pdf.worker.min.mjs', publicRoot)))
  writeFileSync(stamp, JSON.stringify({ version }) + '\n')
}
