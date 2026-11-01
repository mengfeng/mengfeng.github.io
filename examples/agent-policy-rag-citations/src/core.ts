import {corpus,queryValue,searchPolicies,type PolicyChunk} from './policies';
export type Scenario='normal'|'forged'|'unretrieved'|'tampered'|'malformed';
export type Evidence=Readonly<{number:number;chunk:PolicyChunk}>;
export type SearchTool=(query:string)=>Promise<readonly PolicyChunk[]>;
export type SelectModel=(retrieved:readonly PolicyChunk[],scenario:Scenario)=>Promise<unknown>;
export type UiState=Readonly<{status:'idle'|'searching'|'selecting'|'answered'|'no-evidence'|'error';busy:boolean;query:string;retrieved:readonly PolicyChunk[];evidence:readonly Evidence[];trace:readonly string[];message:string}>;
export const initialUi:UiState={status:'idle',busy:false,query:'',retrieved:[],evidence:[],trace:[],message:'输入演示问题，先检索，再选择可核对的原文。'};
function object(raw:unknown):Record<string,unknown>{
 if(typeof raw!=='object'||raw===null||Array.isArray(raw)){throw new Error('模型响应必须是对象。');}
 return raw as Record<string,unknown>;
}
export function validateSelection(raw:unknown,retrieved:readonly PolicyChunk[]):readonly Evidence[]{
 const root=object(raw);
 if(Object.keys(root).length!==1||!Array.isArray(root.selections)||root.selections.length<1||root.selections.length>3){throw new Error('模型只能返回 1–3 条 selections，不能夹带自由回答。');}
 const seen=new Set<string>();const allowed=new Map(retrieved.map(chunk=>[chunk.id,chunk]));
 return root.selections.map((item:unknown,index:number)=>{
  const selection=object(item);
  if(Object.keys(selection).length!==2||typeof selection.chunkId!=='string'||typeof selection.quote!=='string'){throw new Error('引用结构不合法。');}
  const chunk=allowed.get(selection.chunkId);
  if(!chunk){throw new Error('引用不在本轮检索结果中，已拒绝回答。');}
  if(seen.has(chunk.id)||selection.quote!==chunk.text){throw new Error('引用重复或原文被改动，已拒绝回答。');}
  seen.add(chunk.id);return {number:index+1,chunk};
 });
}
export async function mockSelect(retrieved:readonly PolicyChunk[],scenario:Scenario):Promise<unknown>{
 const first=retrieved[0];
 if(!first){return {selections:[]};}
 const valid={chunkId:first.id,quote:first.text};
 if(scenario==='forged'){return {selections:[valid,{chunkId:'fabricated.promise',quote:'演示商家承诺立即退款。'}]};}
 if(scenario==='unretrieved'){
  const other=corpus.find(chunk=>!retrieved.some(hit=>hit.id===chunk.id));
  return {selections:[{chunkId:other?.id||'missing',quote:other?.text||'missing'}]};
 }
 if(scenario==='tampered'){return {selections:[{chunkId:first.id,quote:first.text+' 保证立即退款。'}]};}
 if(scenario==='malformed'){return {answer:'任意生成的承诺',selections:[valid]};}
 return {selections:retrieved.map(chunk=>({chunkId:chunk.id,quote:chunk.text}))};
}
export const localSearch:SearchTool=async query=>searchPolicies(query);
export const localModel:SelectModel=async(retrieved,scenario)=>{await new Promise(resolve=>setTimeout(resolve,160));return mockSelect(retrieved,scenario);};
export function createAgent(search:SearchTool,select:SelectModel,publish:(state:UiState)=>void){
 let state=initialUi;let generation=0;let disposed=false;
 function emit(next:UiState):void{if(!disposed){state=next;publish(next);}}
 async function ask(raw:unknown,scenario:Scenario):Promise<void>{
  if(disposed){return;}
  const id=++generation;const current=()=>id===generation&&!disposed;
  emit(initialUi);
  try{
   const query=queryValue(raw);
   emit({...initialUi,status:'searching',busy:true,query,trace:['模拟模型计划：调用只读 searchPolicies 工具'],message:'正在检索本例演示政策…'});
   const retrieved=await search(query);if(!current()){return;}
   if(retrieved.length>3){throw new Error('检索结果超过本例的 3 个片段上限。');}
   const trace=[...state.trace,'工具 searchPolicies 完成：本轮返回 '+retrieved.length+' 个片段'];
   if(retrieved.length===0){emit({...state,retrieved,evidence:[],trace,status:'no-evidence',busy:false,message:'演示政策中未找到依据，请补充问题或转人工核对；不会生成承诺。'});return;}
   emit({...state,retrieved,evidence:[],trace,status:'selecting',message:'模拟模型只选择本轮片段与精确原文…'});
   const rawSelection=await select(retrieved,scenario);if(!current()){return;}
   const evidence=validateSelection(rawSelection,retrieved);
   emit({...state,evidence,trace:[...trace,'引用校验通过：'+evidence.length+' 条精确原文'],status:'answered',busy:false,message:'以下是演示政策原文的抽取展示，请核对适用条件。'});
  }catch(error:unknown){if(current()){emit({...state,evidence:[],status:'error',busy:false,message:error instanceof Error?error.message:'本例执行失败。'});}}
 }
 return {ask,getState:()=>state,dispose:()=>{disposed=true;++generation;}};
}
