import assert from 'node:assert/strict';
import {once} from 'node:events';
import {request as rawRequest} from 'node:http';
import {createServer} from './server.mjs';
const server=createServer();server.listen(8091,'127.0.0.1');await once(server,'listening');let checks=0;
const key=n=>'op-00000000-0000-0000-0000-'+String(n).padStart(12,'0');const payload={orderId:'DEMO-ORDER-1001',reason:'演示包装破损'};const op=n=>({key:key(n),payload});
async function post(path,input,headers={}){return fetch('http://127.0.0.1:8091'+path,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(input)});}
async function check(name,fn){await fn();checks++;console.log('PASS '+name);}
try{
 await check('static root available',async()=>assert.equal((await fetch('http://127.0.0.1:8091/')).status,200));
 await check('static source not publicly served by local backend',async()=>assert.equal((await fetch('http://127.0.0.1:8091/server.mjs')).status,404));
 await check('normal create returns record',async()=>{const r=await post('/api/applications',{operation:op(1),slowResponse:false});assert.equal(r.status,200);assert.equal((await r.json()).totalRecords,1);});
 await check('same key deduplicates',async()=>{const r=await post('/api/applications',{operation:op(1),slowResponse:false});assert.equal((await r.json()).totalRecords,1);});
 await check('same key changed payload conflicts',async()=>assert.equal((await post('/api/applications',{operation:{key:key(1),payload:{...payload,reason:'演示配件缺失'}},slowResponse:false})).status,409));
 await check('actual HTTP AbortController timeout after server commit',async()=>{const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),200);try{await assert.rejects(fetch('http://127.0.0.1:8091/api/applications',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation:op(2),slowResponse:true}),signal:controller.signal}),{name:'AbortError'});}finally{clearTimeout(timer);}});
 await check('status after timeout finds saved record',async()=>{const r=await post('/api/status',{key:key(2),failLookup:false});const x=await r.json();assert.equal(x.found,true);assert.equal(x.application.key,key(2));assert.equal(x.totalRecords,2);});
 await check('same original operation retry still only two records',async()=>{const r=await post('/api/applications',{operation:op(2),slowResponse:false});assert.equal((await r.json()).totalRecords,2);});
 await check('status missing does not create',async()=>{const r=await post('/api/status',{key:key(3),failLookup:false});assert.deepEqual(await r.json(),{found:false,totalRecords:2});});
 await check('status failure returns 503 without write',async()=>assert.equal((await post('/api/status',{key:key(2),failLookup:true})).status,503));
 await check('concurrent same-key creates are deduplicated',async()=>{const results=await Promise.all([post('/api/applications',{operation:op(3),slowResponse:false}),post('/api/applications',{operation:op(3),slowResponse:false})]);for(const r of results){assert.equal((await r.json()).totalRecords,3);}});
 await check('external Origin rejected',async()=>assert.equal((await post('/api/status',{key:key(2),failLookup:false},{Origin:'https://example.com'})).status,403));
 await check('wrong Host rejected',async()=>{const status=await new Promise((resolve,reject)=>{const req=rawRequest('http://127.0.0.1:8091/api/status',{method:'POST',headers:{Host:'evil.example','Content-Type':'application/json'}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});req.on('error',reject);req.end(JSON.stringify({key:key(2),failLookup:false}));});assert.equal(status,403);});
 await check('wrong content type rejected',async()=>assert.equal((await post('/api/status',{}, {'Content-Type':'text/plain'})).status,415));
 await check('body cap rejects oversized input',async()=>assert.equal((await post('/api/applications',{large:'x'.repeat(3000)})).status,413));
 await check('invalid JSON rejected',async()=>assert.equal((await fetch('http://127.0.0.1:8091/api/status',{method:'POST',headers:{'Content-Type':'application/json'},body:'{'})).status,400));
 await check('invalid payload never creates',async()=>assert.equal((await post('/api/applications',{operation:{key:key(4),payload:{orderId:'real',reason:'bad'}},slowResponse:false})).status,400));
 console.log(checks+' HTTP checks passed');
}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
