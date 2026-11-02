// Local stand-in for Fly's edge compression: forwards to a harness server and
// gzips text responses when the browser accepts gzip.
// node gzip-proxy.mjs <listenPort> <targetPort>
import http from 'node:http';
import zlib from 'node:zlib';

const [listen, target] = process.argv.slice(2).map(Number);
http.createServer((req, res) => {
  const up = http.request({ host: '127.0.0.1', port: target, path: req.url, method: req.method, headers: req.headers }, (r) => {
    const type = r.headers['content-type'] || '';
    const gz = /gzip/.test(req.headers['accept-encoding'] || '') && /text|json|javascript|xml|svg/.test(type) && !r.headers['content-encoding'];
    const headers = { ...r.headers };
    if (gz) { delete headers['content-length']; headers['content-encoding'] = 'gzip'; headers.vary = 'Accept-Encoding'; }
    res.writeHead(r.statusCode, headers);
    (gz ? r.pipe(zlib.createGzip()) : r).pipe(res);
  });
  up.on('error', () => { res.statusCode = 502; res.end(); });
  req.pipe(up);
}).listen(listen, () => console.log(`gzip proxy ${listen} -> ${target}`));
