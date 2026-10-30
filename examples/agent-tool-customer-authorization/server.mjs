import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import {createOrderService,ServiceError,record} from './service.mjs';
const root=dirname(fileURLToPath(import.meta.url));
const staticFiles=new Map([['/',['index.html','text/html; charset=utf-8']],['/index.html',['index.html','text/html; charset=utf-8']],['/app.js',['app.js','text/javascript; charset=utf-8']],['/style.css',['style.css','text/css; charset=utf-8']]]);
function json(res,status,data,headers={}){if(res.destroyed||res.writableEnded)return;res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers});res.end(JSON.stringify(data));}
function token(req){return (req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('demo_session='))?.slice(13)||'';}
function body(req){return new Promise((resolve,reject)=>{let bytes=0;const parts=[];req.on('data',chunk=>{bytes+=chunk.length;if(bytes>2048){reject(new ServiceError(413,'请求体超过 2048 字节。'));return;}parts.push(chunk);});req.on('end',()=>{try{resolve(JSON.parse(Buffer.concat(parts).toString('utf8')));}catch{reject(new ServiceError(400,'请求必须是有效 JSON。'));}});req.on('error',reject);});}
export function createServer(){const service=createOrderService(randomUUID);const server=http.createServer(async(req,res)=>{
  try{
    if(!['127.0.0.1:8090','localhost:8090'].includes(req.headers.host)){json(res,403,{error:'只接受本地演示 Host。'});return;}
    if(req.headers.origin&&!['http://127.0.0.1:8090','http://localhost:8090'].includes(req.headers.origin)){json(res,403,{error:'拒绝外部来源。'});return;}
    const path=req.url;
    if(req.method==='GET'&&staticFiles.has(path)){const[name,type]=staticFiles.get(path);res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store'});res.end(await readFile(join(root,name)));return;}
    if(req.method!=='POST'||!['/api/demo-login','/api/demo-logout','/api/order-tool','/api/session'].includes(path)){json(res,404,{error:'演示路由不存在。'});return;}
    if(!req.headers['content-type']?.startsWith('application/json')){json(res,415,{error:'需要 application/json。'});return;}
    if(Number(req.headers['content-length'])>2048){req.resume();json(res,413,{error:'请求体超过 2048 字节。'},{Connection:'close'});return;}
    const input=await body(req);const currentToken=token(req);
    if(path==='/api/demo-login'){const result=service.login(input);service.logout(currentToken);json(res,200,result.identity,{'Set-Cookie':'demo_session='+result.token+'; HttpOnly; SameSite=Strict; Path=/; Max-Age=300'});return;}
    if(path==='/api/order-tool'){const order=service.query(currentToken,input);json(res,200,{identity:service.identity(currentToken),order});return;}
    if(Object.keys(record(input)).length!==0){throw new ServiceError(400,'此接口只接受空对象。');}
    if(path==='/api/session'){json(res,200,service.identity(currentToken));return;}
    service.logout(currentToken);json(res,200,{loggedOut:true},{'Set-Cookie':'demo_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'});
  }catch(error){json(res,error instanceof ServiceError?error.status:400,{error:error instanceof Error?error.message:'演示请求失败。'});}
});server.requestTimeout=5000;server.headersTimeout=5000;return server;}
if(process.argv[1]===fileURLToPath(import.meta.url)){createServer().listen(8090,'127.0.0.1',()=>console.log('Local demo http://127.0.0.1:8090 (memory only)'));}
