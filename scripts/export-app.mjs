/** Export a complete app plus its local SDK packages, never local credentials/data. */
import {cpSync,existsSync,mkdirSync,readFileSync,writeFileSync,readdirSync} from 'node:fs'
import {resolve,relative,isAbsolute} from 'node:path'
const app=process.argv[2],destination=process.argv[3]
if(!['portal','travel','ledger'].includes(app)||!destination)throw new Error('Usage: npm run export:app -- travel|ledger|portal <new-directory>')
const root=resolve(import.meta.dirname,'..'),output=resolve(destination)
if(existsSync(output))throw new Error('Use a new export directory; existing files are never overwritten')
if(!relative(root,output)||(!isAbsolute(relative(root,output))&&!relative(root,output).startsWith('..')&&!relative(root,output).startsWith('.local')))throw new Error('Export outside the repo or into .local only')
mkdirSync(output,{recursive:true})
const excluded=new Set(['node_modules','dist','target','.local','.git','coverage','pdfjs'])
const filter=source=>{const name=source.split(/[\\/]/).at(-1);return !excluded.has(name)&&(!name.startsWith('.env')||name==='.env.example')&&!/\.(?:clixml|pem|key|age|dump|log|tsbuildinfo)$/.test(name)}
cpSync(resolve(root,'apps',app),resolve(output,'apps',app),{recursive:true,filter})
cpSync(resolve(root,'packages'),resolve(output,'packages'),{recursive:true,filter})
if(app!=='portal')cpSync(resolve(root,app==='travel'?'backend':'smartledger/backend'),resolve(output,'backend'),{recursive:true,filter})
if(app!=='portal'){
  cpSync(resolve(root,app==='travel'?'docker-compose.yml':'smartledger/docker-compose.yml'),resolve(output,'docker-compose.yml'))
  cpSync(resolve(root,app==='travel'?'.env.example':'smartledger/.env.example'),resolve(output,'.env.example'))
}
const definition=JSON.parse(readFileSync(resolve(root,'identity/realm-local.json'),'utf8')).clients.find(client=>client.clientId==={portal:'portal-web',travel:'travel-web',ledger:'smartledger-web'}[app])
const publicUrl='https://'+app+'.example.com/'
definition.rootUrl=publicUrl;definition.baseUrl=publicUrl;definition.redirectUris=[publicUrl+'auth/callback',publicUrl+'auth/silent'];definition.webOrigins=[new URL(publicUrl).origin]
definition.attributes['post.logout.redirect.uris']=publicUrl+'auth/signed-out';definition.attributes['frontchannel.logout.url']=publicUrl+'auth/frontchannel'
writeFileSync(resolve(output,'identity-client.example.json'),JSON.stringify(definition,null,2)+'\n')
const scripts={build:`npm run build --workspace @personal/${app}`,dev:`npm run dev --workspace @personal/${app}`,test:`npm run test --workspace @personal/${app}`}
writeFileSync(resolve(output,'package.json'),JSON.stringify({name:'personal-'+app+'-standalone',private:true,type:'module',workspaces:['apps/'+app,'packages/*'],scripts},null,2)+'\n')
const env=readFileSync(resolve(root,'apps',app,'.env.example'),'utf8').replace(/^VITE_AUTH_MODE=.*$/m,'VITE_AUTH_MODE=standalone')
writeFileSync(resolve(output,'apps',app,'.env.example'),env)
writeFileSync(resolve(output,'README.md'),`# ${app} 独立应用\n\n1. Node 24 下在本目录执行 npm install。\n2. 复制 apps/${app}/.env.example 为 .env.local，填写 HTTPS 服务与同一 OIDC realm 的独立客户端配置。\n3. 设置 VITE_AUTH_MODE=standalone，VITE_APP_BASE_PATH=/，当前应用 PUBLIC_URL 为实际地址。\n4. 执行 npm run build；产物 apps/${app}/dist 可部署到静态服务器，需 SPA 回退。\n5. ${app==='portal'?'账号资料仍由统一身份服务管理。':'backend 是独立 Java 8 API，使用独立数据库；保留 issuer/audience/subject 验证。'}\n\n导出不包含另一个应用的界面源码，也不包含密码、生产数据和本机配置。\n`)
console.log(`Exported ${app}: ${output}; applications present: ${readdirSync(resolve(output,'apps')).join(', ')}`)
