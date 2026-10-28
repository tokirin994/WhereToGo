import {spawnSync} from 'node:child_process'
const command=process.argv[2]
if(!['build','test'].includes(command))throw new Error('Use workspace.mjs build|test')
for(const app of ['portal','travel','ledger']){
  const result=spawnSync(process.execPath,[process.env.npm_execpath,'run',command,'--workspace','@personal/'+app],{stdio:'inherit',env:process.env})
  if(result.status!==0)process.exit(result.status||1)
}
