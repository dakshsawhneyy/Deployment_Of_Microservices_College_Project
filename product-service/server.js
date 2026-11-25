// Product service: catalog, search, stock management.
const http = require('http');

const PORT = process.env.PORT || 3002;
const SERVICE_NAME = process.env.SERVICE_NAME || 'product-service';
const started = Date.now();
let requests = 0;

const products = [
  { id: 1, name: 'Wireless Headphones', category: 'Audio', price: 129.99, stock: 25, emoji: '🎧', description: 'Noise-cancelling, 30h battery.' },
  { id: 2, name: 'Mechanical Keyboard', category: 'Accessories', price: 89.5, stock: 40, emoji: '⌨️', description: 'Hot-swappable, tactile switches.' },
  { id: 3, name: 'Ultrawide Monitor', category: 'Displays', price: 449, stock: 8, emoji: '🖥️', description: '34" curved, 144Hz.' },
  { id: 4, name: 'Gaming Mouse', category: 'Accessories', price: 49.99, stock: 60, emoji: '🖱️', description: '26K DPI optical sensor.' },
  { id: 5, name: 'Smart Watch', category: 'Wearables', price: 199, stock: 15, emoji: '⌚', description: 'Heart rate, GPS, 7-day battery.' },
  { id: 6, name: 'Bluetooth Speaker', category: 'Audio', price: 59, stock: 30, emoji: '🔊', description: 'Waterproof, 360° sound.' },
  { id: 7, name: 'Laptop Stand', category: 'Accessories', price: 34.99, stock: 3, emoji: '💻', description: 'Aluminium, adjustable height.' },
  { id: 8, name: 'Webcam 4K', category: 'Displays', price: 99, stock: 0, emoji: '📷', description: 'Auto-framing, dual mics.' },
];

const send = (res, code, body) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
const readBody = (req) => new Promise((r) => {
  let d = ''; req.on('data', (c) => (d += c));
  req.on('end', () => { try { r(JSON.parse(d || '{}')); } catch { r({}); } });
});

http.createServer(async (req, res) => {
  requests++;
  const url = new URL(req.url, 'http://x');
  const { pathname } = url;
  if (pathname === '/health')
    return send(res, 200, { service: SERVICE_NAME, status: 'ok', uptimeSec: Math.round((Date.now() - started) / 1000), requests, products: products.length, unitsInStock: products.reduce((s, p) => s + p.stock, 0) });

  if (pathname === '/products' && req.method === 'GET') {
    const q = (url.searchParams.get('q') || '').toLowerCase();
    const cat = url.searchParams.get('category');
    return send(res, 200, products.filter((p) => (!q || p.name.toLowerCase().includes(q)) && (!cat || p.category === cat)));
  }
  const m = pathname.match(/^\/products\/(\d+)(\/reserve)?$/);
  if (m) {
    const p = products.find((x) => x.id === +m[1]);
    if (!p) return send(res, 404, { error: 'Product not found' });
    if (!m[2]) return send(res, 200, p);
    if (req.method === 'POST') { // called by order-service at checkout
      const { qty } = await readBody(req);
      if (!Number.isInteger(qty) || qty < 1) return send(res, 400, { error: 'Invalid quantity' });
      if (p.stock < qty) return send(res, 409, { error: `Only ${p.stock} left of ${p.name}` });
      p.stock -= qty;
      return send(res, 200, p);
    }
  }
  send(res, 404, { error: 'Not found' });
}).listen(PORT, () => console.log(`${SERVICE_NAME} listening on ${PORT}`));
