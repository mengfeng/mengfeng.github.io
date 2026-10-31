import { createApp, h, onUnmounted, ref } from 'vue';
import { createApplicationService, createdValue, lookupValue, type Payload } from './service';
import { browserStorage, createWorkflow, initialUi, type Api, type UiState } from './core';
const local = createApplicationService();
function deadline<T>(work: Promise<T>): Promise<T> { return new Promise((resolve,reject)=>{ const timer=setTimeout(()=>reject(new Error('离线传输模拟超时')),200); work.then(value=>{clearTimeout(timer);resolve(value);},error=>{clearTimeout(timer);reject(error);}); }); }
const offlineApi: Api = {
  create: async (operation,slow) => { const result=local.create(operation); return deadline(new Promise(resolve=>setTimeout(()=>resolve(result),slow?650:10))); },
  lookup: async (key,fail) => { if(fail){throw new Error('模拟查询失败');}return local.lookup({key}); },
};
const isHttp = location.protocol==='http:' && ['127.0.0.1','localhost'].includes(location.hostname) && location.port==='8091';
async function request(url:string,input:unknown):Promise<unknown>{
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),200);
  try{const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input),signal:controller.signal});const raw:unknown=await response.json();if(!response.ok){throw new Error('本地接口拒绝或失败');}return raw;}
  finally{clearTimeout(timer);}
}
const httpApi:Api={create:async(operation,slow)=>createdValue(await request('/api/applications',{operation,slowResponse:slow})),lookup:async(key,fail)=>lookupValue(await request('/api/status',{key,failLookup:fail}))};
createApp({setup(){
  const state=ref<UiState>(initialUi);const reason=ref<Payload['reason']>('演示包装破损');const slow=ref(true);const failLookup=ref(false);
  const workflow=createWorkflow(isHttp?httpApi:offlineApi,browserStorage('agent-idempotency-unknown-result:'+(isHttp?'http-8091':'offline')),()=> 'op-'+crypto.randomUUID(),next=>{state.value=next;});
  workflow.init();const restored=state.value.operation;if(restored){reason.value=restored.payload.reason;}onUnmounted(()=>workflow.dispose());
  return()=>h('main',[
    h('p',{class:'eyebrow'},'FRONTEND AGENT LAB / 08'),h('h1','超时之后，先核对原操作'),
    h('p',{class:'intro'},'固定模拟 Agent 只建议演示原因；明确点击提交才创建内存申请。先保存操作键和精确内容，再发送。全部订单与申请都是假数据，没有退款或对外消息。'),
    h('p',{id:'mode',class:'hint'},isHttp?'模式：真实本地 HTTP / Node 内存服务（8091）；慢响应先创建，再延迟 650ms，浏览器 200ms 中止等待。':'模式：离线服务与传输超时模拟 / 不发送业务接口请求。公开静态页不运行 Node。'),
    h('section',{class:'controls'},[
      h('label',{for:'reason'},'固定订单 DEMO-ORDER-1001 / 演示申请原因'),
      h('select',{id:'reason',disabled:Boolean(state.value.operation)||state.value.busy||state.value.status==='blocked',value:reason.value,onChange:(e:Event)=>{if(e.target instanceof HTMLSelectElement){reason.value=e.target.value as Payload['reason'];}}},[h('option',{value:'演示包装破损'},'演示包装破损'),h('option',{value:'演示配件缺失'},'演示配件缺失')]),
      h('button',{id:'suggest',disabled:Boolean(state.value.operation)||state.value.busy||state.value.status==='blocked',onClick:()=>{reason.value='演示包装破损';}},'使用固定模拟建议'),
      h('label',{class:'check'},[h('input',{id:'slow-response',type:'checkbox',checked:slow.value,disabled:Boolean(state.value.operation),onChange:(e:Event)=>{if(e.target instanceof HTMLInputElement){slow.value=e.target.checked;}}}),'模拟已创建但响应超时']),
      h('div',{class:'actions'},[h('button',{id:'submit',disabled:state.value.status!=='idle'||state.value.busy,onClick:()=>void workflow.submit({orderId:'DEMO-ORDER-1001',reason:reason.value},slow.value)},'明确提交演示申请'),h('button',{id:'check',disabled:state.value.status!=='unknown'||state.value.busy,onClick:()=>void workflow.check(failLookup.value)},'查询原操作结果'),h('button',{id:'retry',disabled:state.value.status!=='unknown'||state.value.busy,onClick:()=>void workflow.retry()},'使用原键重试（不换内容）')]),
      h('label',{class:'check'},[h('input',{id:'fail-lookup',type:'checkbox',checked:failLookup.value,onChange:(e:Event)=>{if(e.target instanceof HTMLInputElement){failLookup.value=e.target.checked;}}}),'模拟状态查询失败']),
    ]),
    h('section',{class:'result','data-status':state.value.status,'aria-live':'polite','aria-busy':state.value.busy},[
      h('p',{id:'status'},state.value.message),h('p',{id:'operation-key'},state.value.operation?.key||'尚无操作键'),
      ...(state.value.operation?[h('p',{id:'operation-payload'},state.value.operation.payload.orderId+' · '+state.value.operation.payload.reason)]:[]),
      h('p',{id:'record-count'},'上次可靠响应中的服务记录数 '+state.value.totalRecords),
      ...(state.value.application?[h('div',{id:'application'},[h('h2',state.value.application.applicationId),h('p',state.value.application.payload.reason)])]:[]),
    ]),
    h('footer','刷新仅恢复原键与内容，不自动提交。离线服务刷新会清空记录，HTTP服务重启会清空记录，状态未查到仍未知。一个页面只保留一个操作；未实现账号授权、数据库事务、跨标签协同或真实业务幂等。'),
  ]);
}}).mount('#app');
