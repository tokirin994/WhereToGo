import {createWebAuth} from '@personal/identity/vue'
export const auth=createWebAuth({authority:import.meta.env.VITE_OIDC_AUTHORITY||'',clientId:import.meta.env.VITE_OIDC_CLIENT_ID||'portal-web',audience:'portal-api',
  basePath:import.meta.env.BASE_URL||'/',allowLoopback:import.meta.env.DEV,
  registrationEnabled:import.meta.env.VITE_REGISTRATION_ENABLED!=='false',localMockAuth:import.meta.env.VITE_LOCAL_MOCK_AUTH==='true',
  returnPath:path=>path==='/'||/^\/(system|account|login)(?:\/|$)/.test(path),
})
export const {registrationEnabled,localMockAuth,currentUser,authError,authAction,identity,accountConsoleUrl,initializeAuth,accessToken,signIn,register,signOut}=auth
