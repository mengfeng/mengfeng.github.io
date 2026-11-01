import returns from '../policies/returns.json';
import shipping from '../policies/shipping.json';
import custom from '../policies/custom.json';
export type PolicyChunk = Readonly<{id:string;docId:string;title:string;version:string;section:string;text:string;source:string;keywords:readonly string[]}>;
const documents=[{data:returns,source:'policies/returns.json'},{data:shipping,source:'policies/shipping.json'},{data:custom,source:'policies/custom.json'}] as const;
export const corpus:readonly PolicyChunk[]=Object.freeze(documents.flatMap(({data,source})=>data.chunks.map(chunk=>Object.freeze({...chunk,keywords:Object.freeze([...chunk.keywords]),docId:data.docId,title:data.title,version:data.version,source}))));
export function queryValue(raw:unknown):string{
 if(typeof raw!=='string'||!raw.trim()||raw.trim().length>120){throw new Error('请输入 1–120 字的问题。');}
 return raw.trim();
}
export function searchPolicies(raw:unknown):readonly PolicyChunk[]{
 const query=queryValue(raw).toLowerCase();
 return corpus.map((chunk,index)=>({chunk,index,score:chunk.keywords.reduce((sum,word)=>sum+(query.includes(word)?1:0),0)})).filter(hit=>hit.score>0).sort((a,b)=>b.score-a.score||a.index-b.index).slice(0,3).map(hit=>hit.chunk);
}
