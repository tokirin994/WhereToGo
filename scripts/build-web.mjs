/** Unified release or one independently deployable SPA, using the same source tree. */
import {spawnSync} from 'node:child_process'
import {createRequire} from 'node:module'
import {resolve,dirname} from 'node:path'
const args=process.argv.slice(2),option=(name,fallback)=>{const at=args.indexOf('--'+name);return at<0?fallback:args[at+1]}
const root=resolve(import.meta.dirname,'..')
const npm=process.env.npm_execpath||resolve(dirname(createRequire(import.meta.url).resolve('npm/package.json',{paths:[dirname(process.execPath)]})),'bin/npm-cli.js')
const selected=option('app','all'),standalone=args.includes('--standalone'),origin=new URL(option('origin','https://personal-45-205-23-125.sslip.io')).origin
if(!origin.startsWith('https://'))throw new Error('Production origin must use HTTPS')
if(!['all','portal','travel','ledger'].includes(selected))throw new Error('Unknown application')
if(standalone&&selected==='all')throw new Error('Choose --app when building standalone')
const authority=option('authority',origin+'/identity/realms/personal'),outDir=resolve(option('out-dir',resolve(root,'dist')))
for(const app of selected==='all'?['portal','travel','ledger']:[selected]){
  const prefix=standalone?'/':app==='portal'?'/':`/${app}/`
  const own=option('public-url',origin+prefix)
  const urls={portal:option('portal-url',origin+'/'),travel:origin+'/travel/',ledger:origin+'/ledger/'}
  if(standalone)urls[app]=own
  const env={...process.env,VITE_LOCAL_MOCK_AUTH:'false',VITE_REGISTRATION_ENABLED:'true',VITE_LEDGER_ONLY:standalone&&app==='ledger'?'true':'false',
    VITE_APP_ID:app,VITE_AUTH_MODE:standalone?'standalone':'portal',VITE_APP_BASE_PATH:new URL(standalone?own:origin+prefix).pathname,
    VITE_OIDC_AUTHORITY:authority,VITE_OIDC_CLIENT_ID:{portal:'portal-web',travel:'travel-web',ledger:'smartledger-web'}[app],
    VITE_OIDC_AUDIENCE:{portal:'portal-api',travel:'wheretogo-api',ledger:'smartledger-api'}[app],
    VITE_PORTAL_PUBLIC_URL:urls.portal,VITE_WHERE_TO_GO_PUBLIC_URL:urls.travel,VITE_SMARTLEDGER_PUBLIC_URL:urls.ledger,
    VITE_API_BASE_URL:option('travel-api',origin+'/travel-api'),VITE_SMARTLEDGER_API_URL:option('ledger-api',origin+'/ledger-api'),
  }
  const result=spawnSync(process.execPath,[npm,'run','build','--workspace','@personal/'+app,'--','--mode','release','--outDir',resolve(outDir,app),'--emptyOutDir'],{cwd:root,stdio:'inherit',env})
  if(result.status!==0)process.exit(result.status||1)
}
