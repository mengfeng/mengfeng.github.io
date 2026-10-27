import {test} from 'node:test';import assert from 'node:assert/strict';
import {createDemoServer} from './server.mjs';import {createParser} from './protocol.mjs';
test('实际本地HTTP SSE：响应类型、正常、拆块、失败和截断',async()=>{
 const server=createDemoServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{const base='http://127.0.0.1:'+server.address().port;
 for(const scenario of ['normal','split','coalesced','duplicate','tool-error','truncated']){
  const r=await fetch(base+'/api/progress?scenario='+scenario);assert.equal(r.status,200);assert.match(r.headers.get('content-type'),/text\/event-stream/);
  const reader=r.body.getReader(),p=createParser();for(let n=0;n<1024;n++){const chunk=await reader.read();if(chunk.done){break;}p.push(chunk.value);}
  if(scenario==='truncated'){assert.throws(()=>p.finish(),/不完整/);}else{assert.equal(p.finish().status,scenario==='tool-error'?'error':'complete');}
 }
 assert.equal((await fetch(base+'/api/progress?scenario=unknown')).status,400);assert.equal((await fetch(base+'/../server.mjs')).status,404);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
