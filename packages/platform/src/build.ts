interface BuildContext {error:(message:string)=>never;emitFile:(asset:{type:'asset';fileName:string;source:string})=>unknown}

/** Retain theme-aware fallback declarations for Safari before color-mix().
 * Variable colors cannot be reduced to constants by the CSS compiler.
 */
export function fallbackColors(value:string):string{
  return replaceMix(value)
}
function replaceMix(value:string):string{
  const start=value.indexOf('color-mix(')
  if(start<0)return value
  let depth=1,end=start+10,part='',parts:string[]=[]
  for(;end<value.length;end++){
    const char=value[end]!
    if(char==='(')depth++
    if(char===')')depth--
    if(!depth){parts.push(part.trim());break}
    if(char===','&&depth===1){parts.push(part.trim());part=''}else part+=char
  }
  if(depth||parts.length!==3)return value
  const color=(part:string)=>part.replace(/\s+[\d.]+%\s*$/,'').trim()
  const fallback=color(parts[2]!)==='transparent'?color(parts[1]!):color(parts[2]!)
  return value.slice(0,start)+replaceMix(fallback)+replaceMix(value.slice(end+1))
}
interface CssDeclaration {prop:string;value:string;cloneBefore:(overrides:{value:string})=>unknown}
export const browserCompatibility={
  build:{target:['es2020','safari15.4'],cssTarget:'safari15.4'},
  css:{postcss:{plugins:[{postcssPlugin:'personal-safari-fallbacks',Declaration(decl:CssDeclaration){
    if(decl.prop.startsWith('--'))return
    if(decl.value.includes('color-mix(')){
      const fallback=decl.prop==='box-shadow'?'none':fallbackColors(decl.value)
      if(fallback!==decl.value)decl.cloneBefore({value:fallback})
    }
    if(/\d+dvh\b/.test(decl.value))decl.cloneBefore({value:decl.value.replace(/dvh\b/g,'vh')})
  }}]}},
}

/** Cloudflare Pages headers are generated from public build settings, never from server secrets. */
export function securityHeaders(env:Record<string,string>){
  return {name:'production-security-headers',apply:'build' as const,generateBundle(this:BuildContext){
    if(env.VITE_LOCAL_MOCK_AUTH==='true')this.error('Production builds must set VITE_LOCAL_MOCK_AUTH=false')
    const connections=new Set<string>(["'self'"])
    let identity="'self'"
    const ledger=env.VITE_APP_ID==='ledger'||env.VITE_OIDC_CLIENT_ID==='smartledger-web'
    const images=new Set<string>(["'self'",'data:','blob:',...(ledger?[]:['https://tile.openstreetmap.org'])])
    for(const app of JSON.parse(env.VITE_APPLICATIONS_JSON||'[]')){
      if(!app.apiUrl)continue
      if(app.apiUrl.startsWith('/')&&!app.apiUrl.startsWith('//'))continue
      const url=new URL(app.apiUrl)
      if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)this.error('应用 API 地址必须使用不含凭证的 HTTPS 地址')
      connections.add(url.origin)
    }
    for(const [name,value] of Object.entries(env)){
      if(value&&/VITE_.*(PASSWORD|SECRET|PRIVATE_KEY|SERVICE_ROLE|DATABASE_URL|ACCESS_TOKEN|OPENAI_API_KEY|ANTHROPIC_API_KEY)/.test(name))this.error(`Secret-like public setting is forbidden: ${name}`)
      if(!value||!/(URL|AUTHORITY)$/.test(name))continue
      if(value.startsWith('/')&&!value.startsWith('//')&&!name.includes('AUTHORITY'))continue
      let url:URL
      try{url=new URL(value)}catch{this.error(`Invalid public service address: ${name}`)}
      if(url.protocol!=='https:'||url.username||url.password)this.error(`Production public addresses must use HTTPS without embedded credentials: ${name}`)
      if(/API|AUTHORITY/.test(name)&&(url.search||url.hash))this.error(`API and identity addresses cannot include query strings or fragments: ${name}`)
      if(name==='VITE_OIDC_AUTHORITY')identity=url.origin
      if(name==='VITE_MAP_TILE_URL')images.add(url.origin)
      if(/API|AUTHORITY/.test(name))connections.add(url.origin)
    }
    const csp=["default-src 'self'","script-src 'self' 'wasm-unsafe-eval'","style-src 'self' 'unsafe-inline'",`img-src ${[...images].join(' ')}`,"font-src 'self' data:",`connect-src ${[...connections].join(' ')}`,"worker-src 'self' blob:",`frame-src 'self' ${identity}`,`frame-ancestors 'self' ${identity}`,"object-src 'none'","base-uri 'self'","form-action 'self'","upgrade-insecure-requests"].join('; ')
    this.emitFile({type:'asset',fileName:'_headers',source:`/*\n  Content-Security-Policy: ${csp}\n  Cache-Control: no-cache\n  X-Content-Type-Options: nosniff\n  X-Frame-Options: SAMEORIGIN\n  Strict-Transport-Security: max-age=31536000\n  Referrer-Policy: strict-origin-when-cross-origin\n  Permissions-Policy: camera=(self), microphone=(), geolocation=(self)\n  Cross-Origin-Opener-Policy: same-origin\n\n/auth/frontchannel\n  ! X-Frame-Options\n\n/index.html\n  Cache-Control: no-cache\n`})
    this.emitFile({type:'asset',fileName:'_redirects',source:'/* /index.html 200\n'})
  }}
}
