import {createApp, h, ref} from 'vue';
import {createController, mockedPlan, SAMPLES, type Mode, type State, type Key} from './core';
const LABEL: Record<Key, string> = {amount: '金额', date: '日期', purpose: '用途'};
createApp({setup() {
 const state = ref<State>({status: 'idle', document: {sourceId: '', name: '', text: ''}, result: {fields: [], missing: []}, error: '', trace: []});
 const mode = ref<Mode>('normal');
 const checked = ref(false);
 const controller = createController(next => {state.value = next; checked.value = false;}, async (document, selected) => {
  await new Promise(resolve => setTimeout(resolve, 350));
  return mockedPlan(document, selected);
 });
 controller.edit(SAMPLES.normal, 'normal.txt（内置演示）');
 function input(event: Event): void {
  if (event.target instanceof HTMLTextAreaElement) {controller.edit(event.target.value, '手动编辑的演示文本');}
 }
 function upload(event: Event): void {
  if (!(event.target instanceof HTMLInputElement)) {return;}
  const file = event.target.files?.[0];
  if (file) {void controller.load(file);}
  event.target.value = '';
 }
 return () => h('main', [
  h('header', [h('p', {class: 'eyebrow'}, 'FRONTEND AGENT LAB / 10'), h('h1', '附件是材料，不是命令'), h('p', {class: 'intro'}, '报销文本预审 · Vue 3 + TypeScript · 纯浏览器离线演示')]),
  h('aside', {class: 'notice'}, '请只使用虚构材料。本页无真实模型、OCR、网络上传、审批或提交接口；核对勾选只改变当前页面状态。'),
  h('section', {class: 'workspace'}, [
   h('section', {class: 'panel input-panel'}, [
    h('div', {class: 'section-title'}, [h('span', {class: 'step'}, '01'), h('h2', '读取不可信附件')]),
    h('label', {for: 'file'}, '.txt 文件（最多 16 KiB）'),
    h('input', {id: 'file', type: 'file', accept: '.txt,text/plain', onChange: upload}),
    h('div', {class: 'samples'}, [h('button', {id: 'sample-normal', onClick: () => controller.edit(SAMPLES.normal, 'normal.txt（内置演示）')}, '完整材料'), h('button', {id: 'sample-missing', onClick: () => controller.edit(SAMPLES.missing, 'missing.txt（内置演示）')}, '缺失日期'), h('button', {id: 'sample-injection', onClick: () => controller.edit(SAMPLES.injection, 'injection.txt（内置演示）')}, '夹带指令')]),
    h('label', {for: 'text'}, '原文 · 按固定字段行提取，可直接编辑'),
    h('textarea', {id: 'text', value: state.value.document.text, onInput: input, rows: 10, spellcheck: false, 'aria-describedby': 'source-meta'}),
    h('p', {id: 'source-meta', class: 'meta'}, `${state.value.document.name} · ${state.value.document.sourceId}`),
    h('label', {for: 'mode'}, '固定模拟响应 / 故障注入'),
    h('select', {id: 'mode', value: mode.value, onChange: (event: Event) => {if (event.target instanceof HTMLSelectElement) {mode.value = event.target.value as Mode; controller.edit(state.value.document.text, state.value.document.name);}}}, [h('option', {value: 'normal'}, '只读提取'), h('option', {value: 'forbidden'}, '模拟模型请求提交工具'), h('option', {value: 'tampered'}, '模拟工具篡改引用'), h('option', {value: 'malformed'}, '模拟工具夹带审批字段'), h('option', {value: 'multiple'}, '模拟模型请求多次工具')]),
    h('button', {id: 'analyze', class: 'primary', disabled: state.value.status === 'reading', onClick: () => {void controller.analyze(mode.value);}}, state.value.status === 'running' ? '再次提取（替换当前任务）' : '预审附件'),
   ]),
   h('section', {class: 'panel output-panel'}, [
    h('div', {class: 'section-title'}, [h('span', {class: 'step'}, '02'), h('h2', '核对字段与来源')]),
    h('div', {id: 'result', 'data-status': state.value.status, 'aria-live': 'polite'}, [
     state.value.status === 'awaiting-human' ? h('p', {class: 'status'}, '等待人工核对 · 未提交') : h('p', {class: 'status'}, {idle: '等待预审', reading: '正在读取文件', running: '正在执行只读提取', error: '已拒绝本轮结果'}[state.value.status]),
     state.value.error ? h('p', {id: 'error', role: 'alert', class: 'error'}, state.value.error) : '',
     state.value.status === 'awaiting-human' ? [
      h('div', {id: 'fields'}, state.value.result.fields.map(field => h('article', {class: 'field', 'data-key': field.key}, [h('div', {class: 'field-head'}, [h('strong', LABEL[field.key]), h('span', {class: 'field-value'}, field.value)]), h('p', {class: 'meta'}, `${state.value.document.sourceId} · 第 ${field.line} 行 · 用户附件（不可信）`), h('blockquote', field.quote)]))),
      state.value.result.missing.length > 0 ? h('p', {id: 'missing', class: 'missing'}, `缺失字段：${state.value.result.missing.map(key => LABEL[key]).join('、')}。请补充后重新预审。`) : h('p', {class: 'meta'}, '三个字段均存在；完整不代表真实、合规或已批准。'),
      h('label', {class: 'checkline'}, [h('input', {id: 'reviewed', type: 'checkbox', checked: checked.value, onChange: (event: Event) => {if (event.target instanceof HTMLInputElement) {checked.value = event.target.checked;}}}), '我已查看原文和缺失项（仅页面标记）']),
      checked.value ? h('p', {id: 'review-message'}, '已标记人工查看；仍未提交，刷新即清除。') : '',
     ] : h('p', {class: 'empty'}, '附件中的“忽略规则”“立即提交”会作为原文展示。是否允许工具调用，由固定网关决定。'),
    ]),
    h('div', {class: 'boundary'}, [h('strong', '本轮能力边界'), h('p', '允许：extractReceipt × 1'), h('p', '不提供：提交 / 审批 / 付款 / 外部消息')]),
   ]),
  ]),
  h('section', {class: 'panel trace-panel'}, [h('h2', '可核对的执行记录'), h('ol', {id: 'trace'}, state.value.trace.map(line => h('li', line))), state.value.trace.length === 0 ? h('p', {class: 'meta'}, '编辑或切换附件后，上轮结果与执行记录立即清除。') : '']),
  h('footer', [h('p', '这是确定性解析器和固定模型响应，用于验证权限与数据边界；用例通过不代表真实模型能抵御所有提示注入。'), h('a', {href: 'source.zip'}, '下载完整源码'), ' · ', h('a', {href: 'README.md'}, '运行说明')]),
 ]);
}}).mount('#app');
