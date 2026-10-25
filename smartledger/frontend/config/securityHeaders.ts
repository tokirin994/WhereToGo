import type { Plugin } from 'vite'

/** Cloudflare Pages headers are generated from public build settings, never from server secrets. */
export function securityHeaders(env:Record<string,string>):Plugin{
  return {name:'production-security-headers',apply:'build',generateBundle(){
    if(env.VITE_LOCAL_MOCK_AUTH==='true')this.error('Production builds must set VITE_LOCAL_MOCK_AUTH=false')
    const connections=new Set<string>(["'self'"])
    let identity="'self'"
    for(const [name,value] of Object.entries(env)){
      if(value&&/VITE_.*(PASSWORD|SECRET|PRIVATE_KEY|SERVICE_ROLE|DATABASE_URL|ACCESS_TOKEN|OPENAI_API_KEY|ANTHROPIC_API_KEY)/.test(name))this.error(`Secret-like public setting is forbidden: ${name}`)
      if(!value||!/(URL|AUTHORITY)$/.test(name))continue
      if(value.startsWith('/')&&!value.startsWith('//')&&!name.includes('AUTHORITY'))continue
      let url:URL
      try{url=new URL(value)}catch{this.error(`Invalid public service address: ${name}`)}
      if(url.protocol!=='https:'||url.username||url.password)this.error(`Production public addresses must use HTTPS without embedded credentials: ${name}`)
      if(/API|AUTHORITY/.test(name)&&(url.search||url.hash))this.error(`API and identity addresses cannot include query strings or fragments: ${name}`)
      if(name==='VITE_OIDC_AUTHORITY')identity=url.origin
      if(/API|AUTHORITY/.test(name))connections.add(url.origin)
    }
    const csp=["default-src 'self'","script-src 'self' 'wasm-unsafe-eval'","style-src 'self' 'unsafe-inline'","img-src 'self' data: blob:","font-src 'self' data:",`connect-src ${[...connections].join(' ')}`,"worker-src 'self' blob:",`frame-src 'self' ${identity}`,`frame-ancestors 'self' ${identity}`,"object-src 'none'","base-uri 'self'","form-action 'self'","upgrade-insecure-requests"].join('; ')
    this.emitFile({type:'asset',fileName:'_headers',source:`/*\n  Content-Security-Policy: ${csp}\n  Cache-Control: no-cache\n  X-Content-Type-Options: nosniff\n  X-Frame-Options: SAMEORIGIN\n  Strict-Transport-Security: max-age=31536000\n  Referrer-Policy: no-referrer\n  Permissions-Policy: camera=(self), microphone=(), geolocation=(self)\n  Cross-Origin-Opener-Policy: same-origin\n\n/auth/frontchannel\n  ! X-Frame-Options\n\n/index.html\n  Cache-Control: no-cache\n`})
    this.emitFile({type:'asset',fileName:'_redirects',source:'/* /index.html 200\n'})
  }}
}
