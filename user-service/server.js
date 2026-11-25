// User service: registration, login, token issue + verification.
const http = require('http');
const crypto = require('crypto');

const PORT = process.env.PORT || 3001;
const SERVICE_NAME = process.env.SERVICE_NAME || 'user-service';
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) { console.error('JWT_SECRET must be set'); process.exit(1); }

const started = Date.now();
let requests = 0;
const users = []; // { id, name, email, salt, hash }

const hashPw = (pw, salt) => crypto.scryptSync(pw, salt, 32).toString('hex');
function addUser(name, email, password) {
  const salt = crypto.randomBytes(8).toString('hex');
  const u = { id: users.length + 1, name, email: email.toLowerCase(), salt, hash: hashPw(password, salt) };
  users.push(u);
  return u;
}
addUser('Demo User', 'demo@micromart.dev', 'demo123');

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const sign = (data) => crypto.createHmac('sha256', JWT_SECRET).update(data).digest('base64url');
function issue(u) {
  const body = b64({ id: u.id, name: u.name, email: u.email, exp: Date.now() + 3600e3 });
  return `${body}.${sign(body)}`;
}
function verify(token) {
  const [body, sig] = (token || '').split('.');
  if (!body || !sig || sig !== sign(body)) return null;
  const p = JSON.parse(Buffer.from(body, 'base64url').toString());
  return p.exp > Date.now() ? p : null;
}

const send = (res, code, body) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
const readBody = (req) => new Promise((r) => {
  let d = ''; req.on('data', (c) => (d += c));
  req.on('end', () => { try { r(JSON.parse(d || '{}')); } catch { r({}); } });
});
const pub = (u) => ({ id: u.id, name: u.name, email: u.email });

http.createServer(async (req, res) => {
  requests++;
  const { pathname } = new URL(req.url, 'http://x');
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (pathname === '/health')
    return send(res, 200, { service: SERVICE_NAME, status: 'ok', uptimeSec: Math.round((Date.now() - started) / 1000), requests, users: users.length });

  if (pathname === '/register' && req.method === 'POST') {
    const { name, email, password } = await readBody(req);
    if (!name || !email || !password || password.length < 6) return send(res, 400, { error: 'Name, email and a password of 6+ chars are required' });
    if (users.some((u) => u.email === email.toLowerCase())) return send(res, 409, { error: 'Email already registered' });
    const u = addUser(name, email, password);
    return send(res, 201, { token: issue(u), user: pub(u) });
  }
  if (pathname === '/login' && req.method === 'POST') {
    const { email, password } = await readBody(req);
    const u = users.find((x) => x.email === (email || '').toLowerCase());
    if (!u || u.hash !== hashPw(password || '', u.salt)) return send(res, 401, { error: 'Invalid email or password' });
    return send(res, 200, { token: issue(u), user: pub(u) });
  }
  if (pathname === '/verify' || pathname === '/me') {
    const p = verify(token);
    return p ? send(res, 200, { id: p.id, name: p.name, email: p.email }) : send(res, 401, { error: 'Invalid or expired token' });
  }
  send(res, 404, { error: 'Not found' });
}).listen(PORT, () => console.log(`${SERVICE_NAME} listening on ${PORT}`));
