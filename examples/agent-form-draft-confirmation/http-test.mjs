import assert from 'node:assert/strict';
import http from 'node:http';
import {createServer} from './server.mjs';
const server=createServer();await new Promise(resolve=>server.listen(8089,'127.0.0.1',resolve));
let checks=0;
async function call(path,method='GET',data){const res=await fetch('http://127.0.0.1:8089'+path,{method,headers:{'Content-Type':'application/json'},...(data===undefined?{}:{body:JSON.stringify(data)})});return {status:res.status,body:await res.json()};}
try {
 const original=(await call('/api/state')).body;assert.equal(original.saveCount,0);checks++;
 const fields={recipient:'演示收件人',phone:'DEMO-0001',detail:'演示市示例路 1 号驿站'};
 const draft=await call('/api/draft','PUT',{baseVersion:0,fields});assert.equal(draft.status,200);checks++;
 const p=(await call('/api/preview','POST',{version:draft.body.version})).body;
 assert.equal((await call('/api/state')).body.saveCount,0);checks++;
 assert.equal((await call('/api/invalidate','POST',{version:p.version})).status,200);
 assert.equal((await call('/api/confirm','POST',p)).status,400);checks++;
 const p2=(await call('/api/preview','POST',{version:p.version})).body;
 assert.equal((await call('/api/confirm','POST',{...p2,failSave:true})).status,400);
 assert.equal((await call('/api/state')).body.saveCount,0);checks++;
 const p3=(await call('/api/preview','POST',{version:p.version})).body;
 const results=await Promise.all([call('/api/confirm','POST',p3),call('/api/confirm','POST',p3)]);
 assert.deepEqual(results.map(x=>x.status).sort(),[200,400]);assert.equal((await call('/api/state')).body.saveCount,1);checks++;
 assert.equal((await call('/api/draft','PUT',{baseVersion:0,fields})).status,400);checks++;
 const denied=await fetch('http://127.0.0.1:8089/api/preview',{method:'POST',headers:{Origin:'https://evil.example','Content-Type':'application/json'},body:'{}'});assert.equal(denied.status,403);checks++;
 const badHost=await new Promise((resolve,reject)=>{http.get('http://127.0.0.1:8089/api/state',{headers:{Host:'evil.example'}},res=>{res.resume();resolve(res.statusCode);}).on('error',reject);});assert.equal(badHost,403);checks++;
 assert.equal((await fetch('http://127.0.0.1:8089/package.json')).status,404);checks++;
 assert.equal((await fetch('http://127.0.0.1:8089/api/preview',{method:'POST',headers:{'Content-Type':'text/plain'},body:'{}'})).status,415);checks++;
 const big=await fetch('http://127.0.0.1:8089/api/draft',{method:'PUT',headers:{'Content-Type':'application/json'},body:'"'+'x'.repeat(2100)+'"'});assert.equal(big.status,400);checks++;
 console.log(checks+' HTTP assertions passed (loopback only)');
} finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
