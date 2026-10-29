import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import {createMemoryService} from './service.mjs';
const root=dirname(fileURLToPath(import.meta.url));
const service=createMemoryService(randomUUID);
const staticFiles=new Map([['/',['index.html','text/html; charset=utf-8']],['/index.html',['index.html','text/html; charset=utf-8']],['/app.js',['app.js','text/javascript; charset=utf-8']],['/style.css',['style.css','text/css; charset=utf-8']]]);
function json(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
async function body(req){let parts=[];let bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>2048){throw new Error('请求体超过 2048 字节。');}parts.push(chunk);}return JSON.parse(Buffer.concat(parts).toString('utf8'));}
export function createServer(){return http.createServer(async(req,res)=>{
  try {
    // Demo loopback boundary, not production authentication. No CORS. Browser requests require same Origin.
    if(req.headers.host!=='127.0.0.1:8089' && req.headers.host!=='localhost:8089'){json(res,403,{error:'只接受本地演示 Host。'});return;}
    if(req.headers.origin && !['http://127.0.0.1:8089','http://localhost:8089'].includes(req.headers.origin)){json(res,403,{error:'拒绝外部来源。'});return;}
    const path=req.url;
    if(req.method==='GET' && staticFiles.has(path)){const [name,type]=staticFiles.get(path);res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store'});res.end(await readFile(join(root,name)));return;}
    if(req.method==='GET' && path==='/api/state'){json(res,200,service.state());return;}
    const routes={'PUT /api/draft':service.writeDraft,'POST /api/preview':service.preview,'POST /api/confirm':service.confirm,'POST /api/invalidate':service.invalidate};
    const action=routes[req.method+' '+path];
    if(!action){json(res,404,{error:'演示路由不存在。'});return;}
    if(!req.headers['content-type']?.startsWith('application/json')){json(res,415,{error:'需要 application/json。'});return;}
    json(res,200,action(await body(req)));
  }catch(e){json(res,400,{error:e instanceof Error?e.message:'演示请求失败。'});}
});}
if(process.argv[1]===fileURLToPath(import.meta.url)){createServer().listen(8089,'127.0.0.1',()=>console.log('Local demo http://127.0.0.1:8089 (memory only)'));}
