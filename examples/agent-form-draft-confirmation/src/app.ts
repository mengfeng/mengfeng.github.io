import { createApp, h, ref, onUnmounted } from 'vue';
import { createMemoryService, type Address } from './service';
import { createWorkflow, initialUi, mockExtract, parseDraft, parsePreview, parseSnapshot, type Api, type UiState } from './core';
const local = createMemoryService(() => 'offline-' + crypto.randomUUID());
const offlineApi: Api = { invalidate: async x => local.invalidate(x), state: async () => local.state(), writeDraft: async x => local.writeDraft(x), preview: async x => local.preview(x), confirm: async x => local.confirm(x) };
const isLocalHttp = location.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(location.hostname) && location.port === '8089';
async function request(path: string, method: string, body?: unknown): Promise<unknown> {
  const response = await fetch(path, { method, headers: { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const raw: unknown = await response.json();
  if (!response.ok) { throw new Error(typeof raw === 'object' && raw !== null && 'error' in raw && typeof raw.error === 'string' ? raw.error : '本地服务请求失败。'); }
  return raw;
}
const httpApi: Api = { invalidate: async x => parseSnapshot(await request('/api/invalidate','POST',x)), state: async () => parseSnapshot(await request('/api/state','GET')), writeDraft: async x => parseDraft(await request('/api/draft','PUT',x)), preview: async x => parsePreview(await request('/api/preview','POST',x)), confirm: async x => parseSnapshot(await request('/api/confirm','POST',x)) };
createApp({ setup() {
  const state = ref<UiState>(initialUi); const input = ref('把演示地址改到驿站'); const notice = ref(''); const failSave = ref(false);
  const api = isLocalHttp ? httpApi : offlineApi; const workflow = createWorkflow(api, x => { state.value = x; });
  function patch(key: keyof Address, value: string): void { workflow.edit({ ...state.value.fields, [key]: value }); }
  async function generate(): Promise<void> { if (!(await workflow.beginEdit())) { return; } try { workflow.edit(mockExtract(input.value)); notice.value = '固定模拟提取已填入草稿，尚未保存。'; } catch (e: unknown) { notice.value = e instanceof Error ? e.message : '模拟提取失败。'; } }
  void workflow.init();
  onUnmounted(() => workflow.dispose());
  return () => h('main', [
    h('p', { class: 'eyebrow' }, 'FRONTEND AGENT LAB / 06'), h('h1', '先生成草稿，再确认版本'),
    h('p', { class: 'intro' }, '固定模拟模型只生成草稿。地址均为演示占位，确认后仅保存到演示内存，不接入真实账号或业务。'),
    h('p', { id: 'mode', class: 'hint' }, isLocalHttp ? '模式：本地 HTTP / Node 内存服务（127.0.0.1:8089）' : '模式：离线模拟服务 / 无查询网络请求；公开静态页不会运行 Node。'),
    h('section', { class: 'controls' }, [h('label', { for: 'request' }, '自然语言输入（固定模拟只识别前台 / 驿站）'), h('input', { id: 'request', maxlength: 100, value: input.value, onInput: (e: Event) => { if (e.target instanceof HTMLInputElement) { input.value = e.target.value; } } }), h('button', { id: 'generate', onClick: generate, disabled: state.value.busy }, '生成模拟草稿'), h('p', { id: 'notice' }, notice.value),
      ...([['recipient','收件人（须以演示开头）'],['phone','演示联系方式（DEMO-0001）'],['detail','地址详情（须以演示开头）']] as const).map(([key,label]) => h('div', { class: 'field' }, [h('label', { for: key },label), h('input', { id:key,value:state.value.fields[key],maxlength:key==='detail'?82:30,disabled:state.value.busy || Boolean(state.value.preview),onInput:(e:Event)=>{if(e.target instanceof HTMLInputElement){patch(key,e.target.value);}} })])),
      h('div', { class:'actions' },[h('button',{id:'edit',disabled:state.value.busy || !state.value.preview,onClick:()=>void workflow.beginEdit()},'修改此草稿（撤销确认）'), h('button',{id:'preview',disabled:state.value.busy,onClick:()=>void workflow.prepare()},'预览变更'), h('button',{id:'confirm',disabled:state.value.busy || !state.value.preview || state.value.status!=='ready',onClick:()=>void workflow.confirm(failSave.value)},'确认保存此版本')]),
      h('label',{class:'check'},[h('input',{id:'fail-save',type:'checkbox',checked:failSave.value,onChange:(e:Event)=>{if(e.target instanceof HTMLInputElement){failSave.value=e.target.checked;}}}),'模拟保存失败（不会写入）']),
    ]),
    h('section', { class:'result','aria-live':'polite','aria-busy':state.value.busy,'data-status':state.value.status },[
      h('div',{class:'meta'},[h('span','本地编辑版本 '+state.value.revision),h('span',{id:'save-count'},'保存次数 '+state.value.saveCount)]),h('p',{id:'status',role:state.value.status==='error'?'alert':'status'},state.value.message),
      ...(state.value.preview?[h('h2','确认预览 · 服务端草稿 v'+state.value.preview.version),h('div',{id:'diff'},(['recipient','phone','detail'] as const).map(key=>h('p',[h('strong',key+'：'),h('del',state.value.preview?.before[key]),' → ',h('ins',state.value.preview?.after[key])])) )]:[]),
      h('h2','演示服务已保存地址'),h('p',{id:'saved'},Object.values(state.value.saved).join(' · ')),
    ]), h('footer','预览后锁定字段；点击修改或重新生成先撤销服务端确认资格，再开放编辑。重新预览同步草稿并递增版本。HTTP 服务重启清空数据。没有真实模型、数据库、鉴权、订单修改或对外消息。'),
  ]);
} }).mount('#app');
