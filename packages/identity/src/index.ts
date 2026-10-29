import {UserManager,WebStorageStateStore,type User} from 'oidc-client-ts'
import {createIdentitySessionCore,type IdentityConfig} from './sessionCore'
import {browserSessionStorage} from './storage'
export type {IdentityConfig} from './sessionCore'
export function createIdentitySession(config:IdentityConfig<User>){
  return createIdentitySessionCore<User>(config,settings=>new UserManager({...settings,
    userStore:new WebStorageStateStore({store:browserSessionStorage()}),stateStore:new WebStorageStateStore({store:browserSessionStorage()}),
  }))
}
