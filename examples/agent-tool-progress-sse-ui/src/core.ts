export type Scenario = 'normal' | 'split' | 'coalesced' | 'duplicate' | 'tool-error' | 'truncated';
export type Stage = 'understand' | 'query' | 'compose';
export type Step = Readonly<{ stage: Stage; status: 'running' | 'done' | 'error'; label: string }>;
export type Product = Readonly<{ id: string; name: string }>;
export type ProgressState = Readonly<{ steps: readonly Step[]; products: readonly Product[]; status: 'running' | 'complete' | 'error'; message: string; eventCount: number }>;
type Wire = Readonly<{ id: string; event: 'progress' | 'result' | 'error'; data: unknown }>;
export const SCENARIOS: readonly Scenario[] = ['normal','split','coalesced','duplicate','tool-error','truncated'];
export function initialState(): ProgressState { return { steps: [], products: [], status: 'running', message: '等待完整事件。', eventCount: 0 }; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function text(value: unknown, max: number): value is string { return typeof value === 'string' && value.trim().length > 0 && value.length <= max; }
function readProducts(value: unknown): Product[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 3) { throw new Error('结果商品列表无效。'); }
  const ids = new Set<string>();
  return value.map((item: unknown) => {
    if (!isRecord(item) || !text(item.id,64) || !text(item.name,80) || ids.has(item.id)) { throw new Error('结果商品字段无效。'); }
    ids.add(item.id); return { id: item.id, name: item.name };
  });
}
export function applyEvent(state: ProgressState, event: string, value: unknown): ProgressState {
  if (state.status !== 'running') { throw new Error('终态之后不接受新事件。'); }
  if (!isRecord(value)) { throw new Error('事件 data 必须是对象。'); }
  if (event === 'progress') {
    if (typeof value.stage !== 'string' || typeof value.status !== 'string' || !['understand','query','compose'].includes(value.stage) || !['running','done'].includes(value.status) || !text(value.label,180)) { throw new Error('进度事件字段无效。'); }
    const stage = value.stage as Stage, status = value.status as Step['status'];
    const step: Step = { stage, status, label: value.label };
    const steps = state.steps.some(item => item.stage === stage) ? state.steps.map(item => item.stage === stage ? step : item) : [...state.steps, step];
    return { ...state, steps, message: value.label, eventCount: state.eventCount + 1 };
  }
  if (event === 'result') {
    if (!['understand','query','compose'].every(stage => state.steps.some(step => step.stage === stage && step.status === 'done'))) { throw new Error('步骤未完成，不能显示成功结果。'); }
    return { ...state, products: readProducts(value.products), status: 'complete', message: '已收到完整结果（固定演示数据）。', eventCount: state.eventCount + 1 };
  }
  if (event === 'error') {
    if (!text(value.message,180)) { throw new Error('失败事件字段无效。'); }
    return { ...state, steps: state.steps.map(step => step.status === 'running' ? { ...step, status: 'error' as const } : step), products: [], status: 'error', message: value.message, eventCount: state.eventCount + 1 };
  }
  throw new Error('不支持的事件类型。');
}
export function createParser() {
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let buffer = '', state = initialState(), totalBytes = 0, wireCount = 0;
  const seen = new Set<string>();
  function readAvailable(): void {
    let boundary = buffer.indexOf('\n\n');
    while (boundary >= 0) {
      const block = buffer.slice(0,boundary); buffer = buffer.slice(boundary+2); wireCount++;
      if (wireCount > 32) { throw new Error('事件数量超过演示上限。'); }
      let event = '', id = ''; const data: string[] = [];
      for (const line of block.split('\n')) {
        if (!line || line.startsWith(':')) { continue; }
        const colon = line.indexOf(':'); const field = colon < 0 ? line : line.slice(0,colon); let value = colon < 0 ? '' : line.slice(colon+1); if (value.startsWith(' ')) { value = value.slice(1); }
        if (field === 'event') { event = value; } else if (field === 'id') { id = value; } else if (field === 'data') { data.push(value); }
      }
      if (data.length > 0) {
        if (!/^[0-9]{1,4}$/.test(id) || !['progress','result','error'].includes(event)) { throw new Error('事件 ID 或类型不符合本例协议。'); }
        if (!seen.has(id)) { state = applyEvent(state,event,JSON.parse(data.join('\n')) as unknown); seen.add(id); }
      }
      boundary = buffer.indexOf('\n\n');
    }
    if (buffer.length > 8192) { throw new Error('未完成事件缓冲超过上限。'); }
  }
  return {
    push(bytes: Uint8Array): ProgressState {
      totalBytes += bytes.byteLength; if (totalBytes > 65536) { throw new Error('数据总量超过演示上限。'); }
      buffer += decoder.decode(bytes,{stream:true});
      // 先保留末尾孤立 CR，下一次拼接后再归一化 CRLF。
      buffer = buffer.replace(/\r\n/g,'\n'); readAvailable(); return state;
    },
    finish(): ProgressState {
      buffer += decoder.decode(); buffer = buffer.replace(/\r\n/g,'\n'); readAvailable();
      if (buffer.trim()) { throw new Error('连接已结束，但最后一个事件不完整。'); }
      if (state.status === 'running') { throw new Error('连接已结束，但没有完整终态事件。'); }
      return state;
    }
  };
}
export function readDemoProducts(scenario: Scenario): Product[] {
  if (scenario === 'tool-error') { throw new Error('模拟商品工具失败，未取得结果；本轮停止。'); }
  return [{id:'bag-01',name:'轻量通勤包'},{id:'bag-02',name:'大容量通勤包'}];
}
export function* eventSequence(scenario: Scenario): Generator<Wire> {
  yield { id:'1',event:'progress',data:{stage:'understand',status:'done',label:'已读取固定条件：查询演示通勤包。'} };
  const querying: Wire = { id:'2',event:'progress',data:{stage:'query',status:'running',label:'正在调用本地只读商品工具。'} };
  yield querying; if (scenario === 'duplicate') { yield querying; }
  // 惰性推进到此处才读取本地数据；正常 HTTP 服务已写出 query-running。
  let products: Product[];
  try { products = readDemoProducts(scenario); }
  catch (error: unknown) { yield { id:'3',event:'error',data:{message:error instanceof Error ? error.message : '模拟查询失败。'} }; return; }
  yield { id:'3',event:'progress',data:{stage:'query',status:'done',label:'演示商品查询成功。'} };
  yield { id:'4',event:'progress',data:{stage:'compose',status:'done',label:'已整理固定结果，等待最终结果事件。'} };
  yield { id:'5',event:'result',data:{products} };
}
export function encodeEvent(event: Wire): Uint8Array {
  return new TextEncoder().encode(`id: ${event.id}\nevent: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`);
}
export function fixtureChunks(scenario: Scenario): Uint8Array[] {
  const events = [...eventSequence(scenario)].map(encodeEvent);
  if (scenario === 'split') { return events.flatMap(bytes => { const parts: Uint8Array[] = []; for(let i=0;i<bytes.length;i+=7) { parts.push(bytes.slice(i,i+7)); } return parts; }); }
  if (scenario === 'coalesced') { const all = new Uint8Array(events.reduce((sum,x)=>sum+x.length,0)); let offset=0; for(const e of events){all.set(e,offset);offset+=e.length;} return [all]; }
  if (scenario === 'truncated') { const last=events.length-1; events[last]=events[last].slice(0,-2); }
  return events;
}
export function consumeChunks(chunks: readonly Uint8Array[]): ProgressState { const p=createParser(); for(const chunk of chunks){p.push(chunk);} return p.finish(); }
