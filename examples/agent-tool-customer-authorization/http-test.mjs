import assert from 'node:assert/strict';
import http from 'node:http';
import {createServer} from './server.mjs';
const server=createServer();await new Promise((r,j)=>{server.once('error',j);server.listen(8090,'127.0.0.1',r);});
let checks=0;const base='http://127.0.0.1:8090';
async function post(path,body,cookie='',headers={}){const r=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{}),...headers},body:JSON.stringify(body)});return{status:r.status,data:await r.json(),headers:r.headers};}
function check(label,test){test();checks++;console.log('PASS '+label);}
try{
 const guest=await post('/api/order-tool',{orderId:'DEMO-A-1001'});check('guest rejected 401',()=>assert.equal(guest.status,401));
 const a=await post('/api/demo-login',{account:'A'});const cookie=a.headers.get('set-cookie').split(';')[0];check('login creates HttpOnly strict cookie with no JSON token',()=>{assert.equal(a.status,200);assert.match(a.headers.get('set-cookie'),/HttpOnly/);assert.match(a.headers.get('set-cookie'),/SameSite=Strict/);assert.equal(a.data.account,'A');assert.equal('token'in a.data,false);});
 const session=await post('/api/session',{},cookie);check('existing cookie identity restored',()=>assert.equal(session.data.account,'A'));
 const own=await post('/api/order-tool',{orderId:'DEMO-A-1001'},cookie);check('own order and authoritative identity returned',()=>{assert.equal(own.status,200);assert.equal(own.data.identity.account,'A');assert.equal(own.data.order.orderId,'DEMO-A-1001');assert.equal('owner'in own.data.order,false);});
 const other=await post('/api/order-tool',{orderId:'DEMO-B-2001'},cookie);const absent=await post('/api/order-tool',{orderId:'DEMO-A-9999'},cookie);check('other and absent identical 404 with no content leak',()=>{assert.equal(other.status,404);assert.equal(absent.status,404);assert.deepEqual(other.data,absent.data);assert.deepEqual(Object.keys(other.data),['error']);assert.ok(!JSON.stringify(other.data).includes('水杯'));});
 const forged=await post('/api/order-tool',{orderId:'DEMO-B-2001',customerId:'B'},cookie);check('forged owner field rejected',()=>{assert.equal(forged.status,400);assert.equal('order'in forged.data,false);});
 const invalid=await post('/api/order-tool',{orderId:'bad'},cookie);check('invalid ID rejected',()=>assert.equal(invalid.status,400));
 const b=await post('/api/demo-login',{account:'B'});const cookieB=b.headers.get('set-cookie').split(';')[0];const ownB=await post('/api/order-tool',{orderId:'DEMO-B-2001'},cookieB);check('second session owns B order only',()=>{assert.equal(ownB.status,200);assert.equal(ownB.data.identity.account,'B');});
 const madeup=await post('/api/order-tool',{orderId:'DEMO-B-2001'},'demo_session=made-up');check('invented cookie rejected',()=>assert.equal(madeup.status,401));
 const logout=await post('/api/demo-logout',{},cookie);const after=await post('/api/order-tool',{orderId:'DEMO-A-1001'},cookie);check('logout revokes captured token and expires cookie',()=>{assert.equal(logout.status,200);assert.match(logout.headers.get('set-cookie'),/Max-Age=0/);assert.equal(after.status,401);});
 const badAccount=await post('/api/demo-login',{account:'C'});check('unknown demo account rejected',()=>assert.equal(badAccount.status,400));
 const cross=await post('/api/order-tool',{orderId:'DEMO-B-2001'},cookieB,{Origin:'https://untrusted.example'});check('cross-origin request rejected and no CORS',()=>{assert.equal(cross.status,403);assert.equal(cross.headers.get('access-control-allow-origin'),null);});
 const hostStatus=await new Promise((resolve,reject)=>{const req=http.request(base+'/',{headers:{Host:'evil.example:8090'}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});req.on('error',reject);req.end();});check('unexpected Host rejected',()=>assert.equal(hostStatus,403));
 const badType=await post('/api/order-tool',{orderId:'DEMO-B-2001'},cookieB,{'Content-Type':'text/plain'});check('non JSON rejected',()=>assert.equal(badType.status,415));
 const large=await post('/api/order-tool',{orderId:'x'.repeat(2200)},cookieB);check('body byte limit enforced',()=>assert.equal(large.status,413));
 const staticOk=await fetch(base+'/');const privatePath=await fetch(base+'/src/service.ts');check('static whitelist excludes source route',()=>{assert.equal(staticOk.status,200);assert.equal(privatePath.status,404);});
 const malformed=await fetch(base+'/api/order-tool',{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookieB},body:'{bad'});check('malformed JSON rejected',()=>assert.equal(malformed.status,400));
 console.log(checks+' HTTP checks passed');
}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
