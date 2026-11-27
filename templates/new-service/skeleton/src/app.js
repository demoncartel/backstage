import { createServer } from 'node:http';

export const server = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: '${{ values.name }}' }));
    return;
  }
  res.writeHead(404).end();
});
