import { createServer } from 'node:http'
import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto'
import { URL } from 'node:url'

// Local development OIDC provider. It binds only to loopback and is not suitable for deployment.
const issuer = 'http://localhost:8091/realms/local'
const clientId = 'smartledger-web'
const audience = 'smartledger-api'
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const jwk = publicKey.export({ format: 'jwk' })
jwk.kid = 'smartledger-local-dev'
jwk.use = 'sig'
jwk.alg = 'RS256'
const codes = new Map()

function json(res, value) {
  res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'access-control-allow-origin': '*' })
  res.end(JSON.stringify(value))
}

function base64url(value) {
  return Buffer.from(value).toString('base64url')
}

function token(claims) {
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: jwk.kid }))
  const payload = base64url(JSON.stringify(claims))
  const input = `${header}.${payload}`
  return `${input}.${sign('RSA-SHA256', Buffer.from(input), privateKey).toString('base64url')}`
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', issuer)
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'content-type' })
    return res.end()
  }
  if (url.pathname === '/realms/local/.well-known/openid-configuration') {
    return json(res, {
      issuer,
      authorization_endpoint: `${issuer}/protocol/openid-connect/auth`,
      token_endpoint: `${issuer}/protocol/openid-connect/token`,
      userinfo_endpoint: `${issuer}/protocol/openid-connect/userinfo`,
      jwks_uri: `${issuer}/protocol/openid-connect/certs`,
      end_session_endpoint: `${issuer}/protocol/openid-connect/logout`,
      response_types_supported: ['code'],
      subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: ['RS256'],
      scopes_supported: ['openid', 'profile', 'email'],
      token_endpoint_auth_methods_supported: ['none'],
      code_challenge_methods_supported: ['S256'],
      grant_types_supported: ['authorization_code'],
    })
  }
  if (url.pathname === '/realms/local/protocol/openid-connect/certs') return json(res, { keys: [jwk] })
  if (url.pathname === '/realms/local/mock-session' && req.method === 'GET') {
    const now = Math.floor(Date.now() / 1000)
    const requestedSubject = url.searchParams.get('sub')
    const subject = requestedSubject && /^[a-zA-Z0-9._:-]{1,120}$/.test(requestedSubject) ? requestedSubject : 'local-demo-user'
    const isAdmin = subject === 'local-demo-user'
    const profile = { sub: subject, name: isAdmin ? '本地超管' : '本地隔离回归账号', preferred_username: isAdmin ? 'admin' : subject, email: isAdmin ? 'admin@localhost' : `${subject}@localhost`, email_verified: true }
    const claims = {
      iss: issuer,
      sub: profile.sub,
      aud: audience,
      iat: now,
      exp: now + 3600,
      ...profile,
      role: 'SUPER_ADMIN',
      roles: ['SUPER_ADMIN'],
      scope: 'openid profile email',
    }
    return json(res, { access_token: token(claims), token_type: 'Bearer', expires_in: 3600, profile })
  }
  if (url.pathname === '/realms/local/protocol/openid-connect/auth' && req.method === 'GET') {
    const redirectUri = url.searchParams.get('redirect_uri')
    const state = url.searchParams.get('state')
    const challenge = url.searchParams.get('code_challenge')
    if (url.searchParams.get('client_id') !== clientId || url.searchParams.get('response_type') !== 'code'
      || !['http://localhost:5174', 'http://127.0.0.1:5174'].includes(redirectUri) || !state || !challenge) {
      res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' })
      return res.end('Invalid local OIDC authorization request')
    }
    const code = cryptoRandomCode()
    codes.set(code, { redirectUri, challenge, nonce: url.searchParams.get('nonce'), expires: Date.now() + 60_000 })
    const redirect = new URL(redirectUri)
    redirect.searchParams.set('code', code)
    redirect.searchParams.set('state', state)
    res.writeHead(302, { location: redirect.toString() })
    return res.end()
  }
  if (url.pathname === '/realms/local/protocol/openid-connect/token' && req.method === 'POST') {
    let raw = ''
    for await (const chunk of req) raw += chunk
    const form = new URLSearchParams(raw)
    const code = form.get('code')
    const record = codes.get(code)
    codes.delete(code)
    const verifier = form.get('code_verifier') ?? ''
    const challenge = createHash('sha256').update(verifier).digest('base64url')
    if (!record || record.expires < Date.now() || record.redirectUri !== form.get('redirect_uri') || challenge !== record.challenge || form.get('client_id') !== clientId) {
      res.writeHead(400, { 'content-type': 'application/json' })
      return res.end(JSON.stringify({ error: 'invalid_grant' }))
    }
    const now = Math.floor(Date.now() / 1000)
    const common = { iss: issuer, sub: 'local-demo-user', aud: [clientId, audience], iat: now, exp: now + 3600, name: '本地超管', preferred_username: 'admin', email: 'admin@localhost', role: 'SUPER_ADMIN', roles: ['SUPER_ADMIN'] }
    return json(res, {
      access_token: token({ ...common, aud: audience, scope: 'openid profile email' }),
      id_token: token({ ...common, aud: clientId, nonce: record.nonce, email_verified: true }),
      token_type: 'Bearer', expires_in: 3600, scope: 'openid profile email',
    })
  }
  if (url.pathname === '/realms/local/protocol/openid-connect/userinfo') {
    return json(res, { sub: 'local-demo-user', name: '本地超管', preferred_username: 'admin', email: 'admin@localhost', email_verified: true })
  }
  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
  res.end('Not found')
}).listen(8091, '127.0.0.1', () => console.log(`Local demo OIDC issuer: ${issuer}`))

function cryptoRandomCode() {
  return randomBytes(32).toString('base64url')
}
