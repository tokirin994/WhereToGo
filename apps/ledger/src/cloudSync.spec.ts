import {afterEach,describe,expect,it,vi} from 'vitest'
import {smartSync} from './cloudSync'
import {setSessionTokenProvider} from './apiClient'
import {createInitialSnapshot} from './ledger'
afterEach(()=>{setSessionTokenProvider();vi.unstubAllGlobals()})
describe('automatic first cloud snapshot upload',()=>{
  it('uses the current token once when a locally enabled sync creates the remote snapshot',async()=>{
    const values=new Map<string,string>()
    vi.stubGlobal('localStorage',{getItem:(key:string)=>values.get(key)||null,setItem:(key:string,value:string)=>values.set(key,value)})
    vi.stubGlobal('window',{dispatchEvent:vi.fn()})
    setSessionTokenProvider(vi.fn().mockResolvedValue('current-token'))
    const snapshot=createInitialSnapshot();snapshot.settings.cloudSyncEnabled=true
    const fetcher=vi.fn(async(_input:unknown,options:RequestInit)=>{
      const headers=new Headers(options.headers)
      if(headers.get('authorization')!=='Bearer current-token'||(options.method==='PUT'&&headers.get('content-type')!=='application/json'))return new Response(JSON.stringify({code:'invalid_token'}),{status:401})
      const remote={schemaVersion:snapshot.schemaVersion,revision:options.method==='PUT'?1:0,contentHash:null,snapshot:options.method==='PUT'?snapshot:null,updatedAt:new Date().toISOString()}
      return new Response(JSON.stringify(remote),{headers:{'Content-Type':'application/json'}})
    })
    vi.stubGlobal('fetch',fetcher)
    const result=await smartSync('/api','old-component-token','test-account',snapshot)
    expect(result.remote.revision).toBe(1);expect(result.conflict).toBeNull()
    expect(fetcher.mock.calls.filter(call=>call[1].method==='PUT')).toHaveLength(1)
    expect(JSON.parse(values.get('smartledger-sync:test-account')!).revision).toBe(1)
  })
})
