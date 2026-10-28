import {readFileSync,readdirSync} from 'node:fs'
import {resolve,relative,extname} from 'node:path'
const root=resolve(import.meta.dirname,'..'),errors=[]
function files(directory){return readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?['node_modules','dist','public','.git'].includes(entry.name)?[]:files(resolve(directory,entry.name)):[resolve(directory,entry.name)])}
for(const group of ['apps','packages'])for(const directory of readdirSync(resolve(root,group))){
  const base=resolve(root,group,directory)
  for(const file of files(base).filter(path=>['.ts','.vue','.mjs','.css'].includes(extname(path)))){
    const source=readFileSync(file,'utf8')
    for(const match of source.matchAll(/(?:from\s*|import\s*\(?|@import\s*)['"]([^'"]+)['"]/g)){
      const target=match[1]
      if(target.startsWith('.')){
        const path=resolve(file,'..',target),inside=relative(base,path)
        if(inside.startsWith('..'))errors.push(relative(root,file)+' imports outside its package: '+target)
      }else if(/^@personal\/(portal|travel|ledger)(?:\/|$)/.test(target))errors.push(relative(root,file)+' imports another application: '+target)
    }
  }
}
if(errors.length)throw new Error(errors.join('\n'))
console.log('Application boundaries passed: apps depend only on their own source and shared packages')
