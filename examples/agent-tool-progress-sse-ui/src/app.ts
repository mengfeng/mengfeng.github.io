import { createApp,h,ref } from 'vue';
import { createParser,fixtureChunks,initialState,SCENARIOS,type Scenario,type ProgressState } from './core';
const labels=['正常分阶段','事件拆成多段','多个事件一次到达','重复事件 ID','工具查询失败','连接提前结束'];
createApp({setup(){
 const scenario=ref<Scenario>('normal'),mode=ref('offline'),state=ref<ProgressState>(initialState()),running=ref(false),started=ref(false);
 const localHttp=location.protocol==='http:' && ['127.0.0.1','localhost'].includes(location.hostname);
 function reset(){state.value=initialState();started.value=false;}
 async function execute(){
  if(running.value){return;}running.value=true;started.value=true;state.value=initialState();const parser=createParser();
  try{
   if(mode.value==='http' && localHttp){
    const response=await fetch('/api/progress?scenario='+encodeURIComponent(scenario.value));
    if(!response.ok || !response.headers.get('content-type')?.startsWith('text/event-stream') || !response.body){throw new Error('本地 SSE 服务不可用；请先运行 npm run serve。');}
    const reader=response.body.getReader();
    try{for(let reads=0;reads<1024;reads++){const chunk=await reader.read();if(chunk.done){break;}state.value=parser.push(chunk.value);if(reads===1023){throw new Error('读取次数超过上限。');}}}
    finally{await reader.cancel();reader.releaseLock();}
   }else{
    for(const bytes of fixtureChunks(scenario.value)){state.value=parser.push(bytes);await new Promise<void>(resolve=>setTimeout(resolve,scenario.value==='split'?2:100));}
   }
   state.value=parser.finish();
  }catch(error:unknown){state.value={...state.value,status:'error',products:[],message:error instanceof Error?error.message:'演示读取失败。'};}
  finally{running.value=false;}
 }
 return()=>h('main',[
  h('p',{class:'eyebrow'},'FRONTEND AGENT LAB / 04'),h('h1','让工具进度成为可理解的事件'),
  h('p',{class:'intro'},'固定模拟模型与本地商品数据。公开静态页默认回放字节，不连接模型或真实业务；下载后运行 Node 示例可体验同源 HTTP SSE。这里没有 token 增量。'),
  h('section',{class:'controls'},[
   h('label',{for:'scenario'},'验证场景'),h('select',{id:'scenario',value:scenario.value,disabled:running.value,onChange:(e:Event)=>{const v=e.target instanceof HTMLSelectElement?e.target.value:'';const found=SCENARIOS.find(x=>x===v);if(found){scenario.value=found;reset();}}},SCENARIOS.map((v,i)=>h('option',{value:v},labels[i]))),
   h('label',{for:'mode'},'运行方式'),h('select',{id:'mode',value:mode.value,disabled:running.value,onChange:(e:Event)=>{mode.value=e.target instanceof HTMLSelectElement && e.target.value==='http' && localHttp?'http':'offline';reset();}},[h('option',{value:'offline'},'离线字节回放'),localHttp?h('option',{value:'http'},'同源 Node HTTP SSE'):h('option',{value:'http',disabled:true},'本地 Node 服务模式（下载后体验）')]),
   h('p',{class:'request'},'固定任务：查询两件演示通勤包，依次显示理解条件、查询与整理结果。'),
   h('button',{disabled:running.value,onClick:execute},running.value?'接收演示事件中…':'运行模拟 Agent'),h('button',{class:'secondary',disabled:running.value,onClick:reset},'重置结果'),
   h('small',mode.value==='http'?'将读取当前本地示例服务的真实 HTTP 流；模型与商品仍是模拟。':'回放相同 SSE 编码字节，定时等待只方便观察，不代表真实模型或工具耗时。')]),
  h('section',{'aria-live':'polite','aria-busy':running.value},[
   h('p',{class:state.value.status==='error'?'status error':'status','data-status':started.value?state.value.status:'idle',role:state.value.status==='error'?'alert':'status'},started.value?state.value.message:'尚未运行。'),
   h('ol',{class:'steps'},state.value.steps.map(step=>h('li',{class:'step',key:step.stage,'data-stage':step.stage,'data-step-status':step.status},[h('strong',step.stage==='understand'?'理解条件':step.stage==='query'?'查询商品':'整理结果'),h('span',step.status==='done'?'已完成':step.status==='error'?'已失败':'执行中'),h('p',step.label)]))),
   state.value.status==='complete'?h('ul',{class:'products'},state.value.products.map(p=>h('li',{key:p.id},p.id+' · '+p.name))):h('span'),
   h('p',{class:'event-count','data-count':state.value.eventCount},`已接受 ${state.value.eventCount} 个不重复业务事件。`)]),
  h('footer','解析器是本例协议子集：支持 LF/CRLF、id/event/data 与注释，限制事件数和缓冲；不实现自动重连、Last-Event-ID 或完整 EventSource。没有账号授权、购买或对外通知。')]);
}}).mount('#app');
