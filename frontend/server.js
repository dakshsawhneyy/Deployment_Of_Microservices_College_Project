// Serves the UI and proxies /api/<service>/* to the backend services.
const http = require('http');
const fs = require('fs');
const path = require('path');
const PORT = process.env.PORT || 8080;

const targets = {
  user: process.env.USER_SERVICE_URL,
  product: process.env.PRODUCT_SERVICE_URL,
  order: process.env.ORDER_SERVICE_URL,
  notification: process.env.NOTIFICATION_SERVICE_URL,
};

http.createServer(async (req, res) => {
  const m = req.url.match(/^\/api\/(user|product|order|notification)(\/.*)?$/);
  if (m) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    try {
      const r = await fetch(targets[m[1]] + (m[2] || '/'), {
        method: req.method,
        headers: { 'Content-Type': 'application/json', Authorization: req.headers.authorization || '' },
        body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks),
      });
      res.writeHead(r.status, { 'Content-Type': 'application/json' });
      return res.end(await r.text());
    } catch (e) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: `${m[1]}-service unreachable` }));
    }
  }
  fs.readFile(path.join(__dirname, 'public', 'index.html'), (err, data) => {
    if (err) { res.writeHead(500); return res.end('error'); }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(data);
  });
}).listen(PORT, () => console.log(`frontend listening on ${PORT}`));
