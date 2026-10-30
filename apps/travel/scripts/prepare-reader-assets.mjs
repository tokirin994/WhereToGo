import {createRequire} from 'node:module'
import {cpSync,mkdirSync,existsSync,readFileSync,writeFileSync} from 'node:fs'
import {dirname,join,resolve} from 'node:path'
const require=createRequire(import.meta.url),out=resolve(import.meta.dirname,'../public/reader')
const pkg=name=>dirname(require.resolve(name+'/package.json'))
const versions={recipe:2,...Object.fromEntries(['pdfjs-dist','tesseract.js','tesseract.js-core','@tesseract.js-data/chi_sim','@tesseract.js-data/eng'].map(name=>[name,JSON.parse(readFileSync(join(pkg(name),'package.json'),'utf8')).version]))}
const stamp=join(out,'versions.json')
if(existsSync(stamp)&&readFileSync(stamp,'utf8')===JSON.stringify(versions))process.exit(0)
mkdirSync(out,{recursive:true})
const pdf=pkg('pdfjs-dist');mkdirSync(join(out,'pdfjs'),{recursive:true})
for(const name of ['cmaps','iccs','standard_fonts','wasm'])cpSync(join(pdf,name),join(out,'pdfjs',name),{recursive:true})
cpSync(join(pdf,'build/pdf.worker.min.mjs'),join(out,'pdfjs/pdf.worker.min.mjs'))
mkdirSync(join(out,'ocr/lang'),{recursive:true});cpSync(join(pkg('tesseract.js'),'dist/worker.min.js'),join(out,'ocr/worker.min.js'))
const core=pkg('tesseract.js-core')
for(const name of ['tesseract-core-lstm','tesseract-core-simd-lstm','tesseract-core-relaxedsimd-lstm'])for(const suffix of ['.wasm','.wasm.js'])cpSync(join(core,name+suffix),join(out,'ocr',name+suffix))
for(const lang of ['chi_sim','eng'])cpSync(join(pkg('@tesseract.js-data/'+lang),'4.0.0_best_int',lang+'.traineddata.gz'),join(out,'ocr/lang',lang+'.traineddata.gz'))
writeFileSync(stamp,JSON.stringify(versions))
