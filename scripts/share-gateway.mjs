// Temporary sharing gateway. Bind loopback, serve production bundles, expose only a dedicated realm/APIs.
import http from 'node:http'
import {readFileSync,createReadStream,statSync} from 'node:fs'
import path from 'node:path'

const stateFile=process.argv[2]
if(!stateFile)throw Error('Pass the private sharing state file')
let state=JSON.parse(readFileSync(stateFile,'utf8').replace(/^\uFEFF/,''))
const initialId=state.sessionId
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon','.woff2':'font/woff2','.wasm':'application/wasm','.pdf':'application/pdf','.bcmap':'application/octet-stream','.ttf':'font/ttf'}
const baseHeaders={'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Cache-Control':'no-store','Permissions-Policy':'camera=(self), microphone=(), geolocation=(self)','X-Frame-Options':'SAMEORIGIN','Strict-Transport-Security':'max-age=86400'}
types['.mjs']='text/javascript; charset=utf-8'
const rate=new Map()
const page=(res,status,message)=>{res.writeHead(status,{'Content-Type':'text/html; charset=utf-8',...baseHeaders});res.end(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>我的空间 · 临时分享</title><body style="font:16px system-ui;background:#111827;color:#e5e7eb;display:grid;place-items:center;min-height:90vh"><main style="max-width:520px;padding:28px"><h1>我的空间</h1><p>${message}</p></main></body></html>`)}
function refresh(){try{const next=JSON.parse(readFileSync(stateFile,'utf8').replace(/^\uFEFF/,''));if(next.sessionId===initialId)state=next}catch{}}
function proxy(req,res,pathname,port,prefix,identity=false){
  const headers={...req.headers}
  for(const name of ['connection','proxy-connection','transfer-encoding','forwarded','x-forwarded-for','x-forwarded-host','x-forwarded-proto','x-forwarded-port','x-real-ip'])delete headers[name]
  headers.host=`127.0.0.1:${port}`
  if(identity){headers.host=new URL(state.publicOrigin).host;headers['x-forwarded-proto']='https';headers['x-forwarded-host']=headers.host;headers['x-forwarded-port']='443'}
  const upstream=http.request({host:'127.0.0.1',port,method:req.method,path:req.url.slice(prefix.length)||'/',headers,timeout:90000},response=>{
    const output={...response.headers,...baseHeaders}
    delete output['transfer-encoding'];delete output.connection;delete output.server
    res.writeHead(response.statusCode||502,output);response.pipe(res)
  })
  let bytes=0
  const limit=identity?2*1024*1024:port===state.ports.ledger?11*1024*1024:1024*1024
  req.on('data',chunk=>{bytes+=chunk.length;if(bytes>limit){upstream.destroy();if(!res.headersSent)page(res,413,'请求文件过大，请缩小后再试。');req.destroy()}})
  upstream.on('timeout',()=>upstream.destroy(Error('timeout')))
  upstream.on('error',()=>{if(!res.headersSent)page(res,503,'服务正在准备或暂时不可用，请稍后刷新。');else res.destroy()})
  req.on('aborted',()=>upstream.destroy())
  req.pipe(upstream)
}
function serve(req,res,pathname,app){
  const ledger=app==='ledger'
  const root=ledger&&state.ledgerDist?path.resolve(state.ledgerDist):path.resolve(state.root,'dist',app)
  const route=app==='portal'?pathname.slice(1):pathname.slice(('/'+app+'/').length)
  let file=path.resolve(root,route||'index.html')
  if(path.relative(root,file).startsWith('..')||path.isAbsolute(path.relative(root,file))||route.split('/').some(part=>part.startsWith('.')||part==='_headers'||part==='_redirects'))return page(res,404,'页面不存在。')
  let stat
  try{stat=statSync(file);if(stat.isDirectory()){file=path.join(file,'index.html');stat=statSync(file)}}catch{}
  if(!stat?.isFile()){
    if(path.extname(route))return page(res,404,'资源不存在。')
    file=path.join(root,'index.html');try{stat=statSync(file)}catch{return page(res,503,'分享环境正在准备，请稍后刷新。')}
  }
  const headers={...baseHeaders,'Content-Type':types[path.extname(file)]||'application/octet-stream','Content-Length':stat.size}
  try{
    const policy=readFileSync(path.join(root,'_headers'),'utf8').split('\n').find(line=>line.trim().startsWith('Content-Security-Policy:'))
    if(policy)headers['Content-Security-Policy']=policy.trim().slice('Content-Security-Policy:'.length).trim()
  }catch{}
  if(route.startsWith('assets/'))headers['Cache-Control']='public, max-age=31536000, immutable'
  res.writeHead(200,headers)
  if(req.method==='HEAD')res.end();else createReadStream(file).pipe(res)
}
const server=http.createServer((req,res)=>{
  refresh()
  const allowed=new Set(['127.0.0.1:18180','localhost:18180'])
  if(state.publicOrigin)allowed.add(new URL(state.publicOrigin).host)
  if(!allowed.has(req.headers.host||''))return page(res,421,'访问地址不匹配。')
  if(Date.now()>Date.parse(state.expiresAt))return page(res,410,'临时分享已经结束，请联系分享者获取新的入口。')
  let pathname
  try{pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname)}catch{return page(res,400,'请求地址无效。')}
  if(pathname.includes('\\')||pathname.includes('\0')||pathname.includes('%')||pathname.split('/').some(part=>part==='.'||part==='..'))return page(res,400,'请求地址无效。')
  if(pathname==='/__share/health'){
    res.writeHead(200,{'Content-Type':'application/json',...baseHeaders});return res.end(JSON.stringify({status:state.ready?'ready':'starting',expiresAt:state.expiresAt}))
  }
  const minute=Math.floor(Date.now()/60000),client=req.headers['cf-connecting-ip']||req.socket.remoteAddress
  if(rate.size>4096)rate.clear()
  const key=String(client),bucket=rate.get(key)
  if(!bucket||bucket.minute!==minute)rate.set(key,{minute,count:1})
  else if(++bucket.count>600){res.setHeader('Retry-After','60');return page(res,429,'操作过于频繁，请稍后再试。')}
  if(!state.publicOrigin)return page(res,503,'临时入口正在准备，请稍后刷新。')
  if(pathname==='/identity'||pathname.startsWith('/identity/')){
    if(pathname.startsWith('/identity/realms/share/')||pathname.startsWith('/identity/resources/'))return proxy(req,res,pathname,state.ports.identity,'',true)
    return page(res,404,'此入口不可访问。')
  }
  if(state.ledgerOnly){
    if(pathname==='/'||pathname==='/index.html'){
      if(!['GET','HEAD'].includes(req.method))return page(res,405,'不支持此请求方式。')
      res.writeHead(302,{Location:'/ledger/',...baseHeaders});return res.end()
    }
    if(pathname!=='/ledger'&&!pathname.startsWith('/ledger/')&&pathname!=='/ledger-api'&&!pathname.startsWith('/ledger-api/'))return page(res,404,'当前仅开放 SmartLedger 记账服务。')
  }
  for(const [prefix,port,health]of[['/travel-api',state.ports.travel,'/api/v1/health'],['/ledger-api',state.ports.ledger,'/actuator/health']]){
    if(pathname===prefix||pathname.startsWith(prefix+'/')){
      const route=pathname.slice(prefix.length)
      if(route!==health&&!route.startsWith('/api/v1/'))return page(res,404,'接口不存在。')
      return proxy(req,res,pathname,port,prefix)
    }
  }
  if(!['GET','HEAD'].includes(req.method))return page(res,405,'不支持此请求方式。')
  if(['/ledger','/travel'].includes(pathname)){res.writeHead(308,{Location:pathname+'/',...baseHeaders});return res.end()}
  if(!state.ready)return page(res,503,'分享环境正在准备，请稍后刷新。')
  serve(req,res,pathname,pathname.startsWith('/ledger/')?'ledger':pathname.startsWith('/travel/')?'travel':'portal')
})
server.requestTimeout=100000;server.headersTimeout=15000;server.maxHeadersCount=80
server.listen(18180,'127.0.0.1',()=>process.stdout.write('Sharing gateway bound to loopback:18180\n'))
