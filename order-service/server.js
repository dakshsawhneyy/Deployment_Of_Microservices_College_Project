// Order service: orchestrates checkout across user, product and notification services.
const http = require('http');

const PORT = process.env.PORT || 3003;
const SERVICE_NAME = process.env.SERVICE_NAME || 'order-service';
const { USER_SERVICE_URL, PRODUCT_SERVICE_URL, NOTIFICATION_SERVICE_URL } = process.env;
if (!USER_SERVICE_URL || !PRODUCT_SERVICE_URL || !NOTIFICATION_SERVICE_URL) {
  console.error('USER_SERVICE_URL, PRODUCT_SERVICE_URL and NOTIFICATION_SERVICE_URL must be set');
  process.exit(1);
}

const started = Date.now();
let requests = 0;
const orders = [];

const send = (res, code, body) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
const readBody = (req) => new Promise((r) => {
  let d = ''; req.on('data', (c) => (d += c));
  req.on('end', () => { try { r(JSON.parse(d || '{}')); } catch { r({}); } });
});

// Calls another service and records it in the trace.
async function call(trace, service, label, url, opts = {}) {
  const t0 = Date.now();
  let r, data;
  try {
    r = await fetch(url, opts);
    data = await r.json().catch(() => ({}));
  } catch (e) {
    trace.push({ service, action: label, ok: false, ms: Date.now() - t0 });
    throw Object.assign(new Error(`${service} unreachable`), { status: 502 });
  }
  trace.push({ service, action: label, ok: r.ok, ms: Date.now() - t0 });
  if (!r.ok) throw Object.assign(new Error(data.error || `${service} error`), { status: r.status });
  return data;
}
const post = (body) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

http.createServer(async (req, res) => {
  requests++;
  const { pathname } = new URL(req.url, 'http://x');
  if (pathname === '/health')
    return send(res, 200, { service: SERVICE_NAME, status: 'ok', uptimeSec: Math.round((Date.now() - started) / 1000), requests, orders: orders.length, revenue: +orders.reduce((s, o) => s + o.total, 0).toFixed(2) });

  if (pathname !== '/orders') return send(res, 404, { error: 'Not found' });
  const trace = [];
  try {
    // 1. Authenticate via user-service
    const user = await call(trace, 'user-service', 'Verify token', `${USER_SERVICE_URL}/verify`, { headers: { Authorization: req.headers.authorization || '' } });

    if (req.method === 'GET') return send(res, 200, orders.filter((o) => o.user.id === user.id).reverse());

    if (req.method === 'POST') {
      const { items } = await readBody(req);
      if (!Array.isArray(items) || !items.length) return send(res, 400, { error: 'Cart is empty', trace });

      // 2. Reserve stock for each line via product-service
      const lines = [];
      for (const it of items) {
        const p = await call(trace, 'product-service', `Reserve ${it.qty} x #${it.productId}`, `${PRODUCT_SERVICE_URL}/products/${it.productId}/reserve`, post({ qty: it.qty }));
        lines.push({ productId: p.id, name: p.name, emoji: p.emoji, price: p.price, qty: it.qty });
      }
      const order = {
        id: 1000 + orders.length + 1, user, items: lines, status: 'CONFIRMED',
        total: +lines.reduce((s, l) => s + l.price * l.qty, 0).toFixed(2),
        createdAt: new Date().toISOString(),
      };
      orders.push(order);

      // 3. Notify — best effort, never fails the order
      await call(trace, 'notification-service', 'Send confirmation', `${NOTIFICATION_SERVICE_URL}/notify`, post({
        userId: user.id, email: user.email, subject: `Order #${order.id} confirmed`,
        message: `Hi ${user.name}, your order of ${lines.length} item(s) totalling $${order.total} is confirmed.`,
      })).catch(() => {});
      return send(res, 201, { order, trace });
    }
    send(res, 405, { error: 'Method not allowed' });
  } catch (e) {
    send(res, e.status || 500, { error: e.message, trace });
  }
}).listen(PORT, () => console.log(`${SERVICE_NAME} listening on ${PORT}`));
