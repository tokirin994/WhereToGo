import {spawnSync} from 'node:child_process'
import {readdirSync,readFileSync} from 'node:fs'
import {resolve} from 'node:path'
const command=process.argv[2]
if(!['build','test'].includes(command))throw new Error('Use workspace.mjs build|test')
const root=resolve(import.meta.dirname,'..')
const applications=readdirSync(resolve(root,'apps'),{withFileTypes:true}).filter(entry=>entry.isDirectory()).map(entry=>JSON.parse(readFileSync(resolve(root,'apps',entry.name,'package.json'),'utf8'))).sort((a,b)=>a.name==='@personal/portal'?-1:b.name==='@personal/portal'?1:a.name.localeCompare(b.name))
for(const app of applications.filter(app=>app.scripts?.[command])){
  const result=spawnSync(process.execPath,[process.env.npm_execpath,'run',command,'--workspace',app.name],{cwd:root,stdio:'inherit',env:process.env})
  if(result.status!==0)process.exit(result.status||1)
}
