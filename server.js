import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
const root = resolve('public');
const types = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.svg':'image/svg+xml'};
http.createServer(async (req,res)=>{
  const pathname = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const file = resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
  if (file!==root && !file.startsWith(root+sep)){res.writeHead(403).end();return;}
  try {const body=await readFile(file);res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(body);}
  catch {res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'}).end('Not found');}
}).listen(process.env.PORT||3000,'0.0.0.0',()=>console.log('Website running'));
