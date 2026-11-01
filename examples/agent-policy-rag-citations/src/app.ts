import {createApp,h,onUnmounted,ref} from 'vue';
import {createAgent,initialUi,localSearch,localModel,type Scenario,type UiState} from './core';
function openSource(number:number):void{
 const detail=document.getElementById('source-'+number);
 if(detail instanceof HTMLDetailsElement){detail.open=true;detail.focus();detail.scrollIntoView({block:'center',behavior:'smooth'});}
}
createApp({setup(){
 const question=ref('普通商品怎么退货？');const scenario=ref<Scenario>('normal');const state=ref<UiState>(initialUi);
 const agent=createAgent(localSearch,localModel,next=>{state.value=next;});onUnmounted(()=>agent.dispose());
 function run(text:string):void{question.value=text;void agent.ask(text,scenario.value);}
 const scenarios:readonly [Scenario,string][]=[['normal','正常选择原文'],['forged','伪造不存在的引用 ID'],['unretrieved','引用未检索的有效片段'],['tampered','篡改引用原文'],['malformed','夹带自由回答 / 错误结构']];
 return()=>h('main',[
  h('p',{class:'eyebrow'},'FRONTEND AGENT LAB / 09'),h('h1','回答旁边，放上能核对的原文'),
  h('p',{class:'intro'},'Vue 3 + TypeScript 的最小检索 Agent。固定模拟模型先调用只读检索工具，再选择本轮原文；没有真实模型、向量库、后台服务或业务写操作。'),
  h('p',{class:'hint'},'所有政策专为教学编写，不对应真实商家、法定规则或售后承诺。离线包内全部数据公开，不需要 API 密钥或 CDN。'),
  h('section',{class:'controls'},[
   h('label',{for:'question'},'客服问题（受控关键词检索）'),h('input',{id:'question',maxlength:120,value:question.value,onInput:(e:Event)=>{if(e.target instanceof HTMLInputElement){question.value=e.target.value;}}}),
   h('label',{for:'scenario'},'模拟模型响应场景'),h('select',{id:'scenario',value:scenario.value,onChange:(e:Event)=>{if(e.target instanceof HTMLSelectElement){const value=e.target.value;const chosen=scenarios.find(([id])=>id===value);if(chosen){scenario.value=chosen[0];}}}},scenarios.map(([id,label])=>h('option',{value:id},label))),
   h('div',{class:'actions'},[h('button',{id:'ask',onClick:()=>run(question.value)},'检索并回答'),h('button',{id:'returns',class:'secondary',onClick:()=>run('普通商品怎么退货？')},'普通退货'),h('button',{id:'shipping',class:'secondary',onClick:()=>run('演示运费谁付？')},'退回运费'),h('button',{id:'custom',class:'secondary',onClick:()=>run('定制刻字商品怎么办？')},'定制商品'),h('button',{id:'unknown',class:'secondary',onClick:()=>run('演示会员积分过期吗？')},'没有依据')]),
  ]),
  h('section',{class:'result','data-status':state.value.status,'aria-live':'polite','aria-busy':state.value.busy},[
   h('h2',state.value.query?'本轮已提交问题：'+state.value.query:'等待提交问题'),h('p',{id:'status',role:state.value.status==='error'?'alert':'status'},state.value.message),
   h('ol',{id:'trace'},state.value.trace.map(line=>h('li',line))),
   ...(state.value.evidence.length?[h('div',{id:'answer'},[h('h2','演示政策写明（抽取式答案）'),...state.value.evidence.map(evidence=>h('p',{class:'answer-line'},[h('span',evidence.chunk.text),' ',h('button',{id:'cite-'+evidence.number,class:'citation',onClick:()=>openSource(evidence.number),'aria-controls':'source-'+evidence.number},'['+evidence.number+'] 查看原文')]))])]:[]),
   ...(state.value.evidence.length?[h('section',{id:'sources'},[h('h2','引用原文与版本'),...state.value.evidence.map(evidence=>h('details',{id:'source-'+evidence.number,tabindex:-1},[
    h('summary','['+evidence.number+'] '+evidence.chunk.title+' · '+evidence.chunk.section),h('p',{class:'source-meta'},evidence.chunk.version+' / '+evidence.chunk.docId+' / '+evidence.chunk.id),h('blockquote',evidence.chunk.text),h('a',{href:evidence.chunk.source,target:'_blank',rel:'noopener'},'打开本地演示政策 JSON 全文'),
   ]))])]:[]),
   h('h2','本轮检索结果（最多 3 个）'),h('ul',{id:'retrieval'},state.value.retrieved.map(chunk=>h('li',chunk.id+' · '+chunk.title+' / '+chunk.section))),
  ]),
  h('footer','引用校验只证明选中 ID 来自本轮检索、quote 与该片段完全相同。它不证明关键词检索找全依据、政策适用于所有情况、或任意自然语言推理正确。没有依据时交回人工；真实模型接入还需独立评测。'),
 ]);
}}).mount('#app');
