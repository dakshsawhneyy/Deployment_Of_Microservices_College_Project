// Notification service: stores (simulated) emails sent to users.
const http = require('http');

const PORT = process.env.PORT || 3004;
const SERVICE_NAME = process.env.SERVICE_NAME || 'notification-service';
const started = Date.now();
let requests = 0;
const notifications = [];

const send = (res, code, body) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
const readBody = (req) => new Promise((r) => {
  let d = ''; req.on('data', (c) => (d += c));
  req.on('end', () => { try { r(JSON.parse(d || '{}')); } catch { r({}); } });
});

http.createServer(async (req, res) => {
  requests++;
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/health')
    return send(res, 200, { service: SERVICE_NAME, status: 'ok', uptimeSec: Math.round((Date.now() - started) / 1000), requests, sent: notifications.length });

  if (url.pathname === '/notify' && req.method === 'POST') {
    const { userId, email, subject, message } = await readBody(req);
    if (!userId || !subject) return send(res, 400, { error: 'userId and subject required' });
    const n = { id: notifications.length + 1, userId, email, subject, message, sentAt: new Date().toISOString() };
    notifications.push(n);
    console.log(`[email] to=${email} subject="${subject}"`);
    return send(res, 201, n);
  }
  if (url.pathname === '/notifications' && req.method === 'GET') {
    const uid = url.searchParams.get('userId');
    return send(res, 200, notifications.filter((n) => !uid || n.userId === +uid).reverse());
  }
  send(res, 404, { error: 'Not found' });
}).listen(PORT, () => console.log(`${SERVICE_NAME} listening on ${PORT}`));
