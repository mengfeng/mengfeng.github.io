import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {SCENARIOS,eventSequence,encodeEvent,fixtureChunks} from './protocol.mjs';
const files={'/':'index.html','/index.html':'index.html','/app.js':'app.js','/style.css':'style.css'};
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export function createDemoServer(){return http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url??'/','http://127.0.0.1');
  if(req.method!=='GET'){res.writeHead(405).end('GET only');return;}
  if(url.pathname==='/api/progress'){
   const scenario=url.searchParams.get('scenario')??'normal';if(!SCENARIOS.includes(scenario)){res.writeHead(400).end('Unknown scenario');return;}
   res.writeHead(200,{'content-type':'text/event-stream; charset=utf-8','cache-control':'no-cache','x-content-type-options':'nosniff'});res.flushHeaders();
   function* encoded(){for(const event of eventSequence(scenario)){yield encodeEvent(event);}}
   const chunks=scenario==='normal'||scenario==='tool-error'||scenario==='duplicate'?encoded():fixtureChunks(scenario);
   for(const bytes of chunks){if(res.destroyed){break;}res.write(bytes);await delay(scenario==='split'?2:100);}
   res.end();return;
  }
  const name=files[url.pathname];if(!name){res.writeHead(404).end('Not found');return;}
  const bytes=await readFile(new URL('./'+name,import.meta.url));const ext=name.slice(name.lastIndexOf('.'));res.writeHead(200,{'content-type':types[ext]??'application/octet-stream'}).end(bytes);
 }catch{if(!res.headersSent){res.writeHead(500);}res.end('Local demo failed');}
});}
if(process.argv[1] && fileURLToPath(import.meta.url)===fileURLToPath(new URL('file://'+process.argv[1]))){
 const port=Number(process.env.PORT??8087);if(!Number.isSafeInteger(port)||port<1||port>65535){throw new Error('Invalid PORT');}
 createDemoServer().listen(port,'127.0.0.1',()=>console.log(`Local SSE demo: http://127.0.0.1:${port}`));
}
