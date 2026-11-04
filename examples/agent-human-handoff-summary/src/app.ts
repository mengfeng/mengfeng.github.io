import {createApp, h, onUnmounted, ref} from 'vue';
import {createController, createDemoQueue, eligible, initialSession, mockedSummary, summaryText, type SaveMode, type State, type SummaryMode} from './core';
createApp({setup() {
 const state = ref<State>({session: initialSession(1), status: 'chat', draft: [], operationId: '', queue: [], error: '', trace: []});
 const summaryMode = ref<SummaryMode>('normal');const saveMode = ref<SaveMode>('normal');
 const message = ref('');const copyStatus = ref('');const copiedText = ref('');let copyGeneration = 0;
 const queue = createDemoQueue();
 const controller = createController(next => {copyGeneration += 1;state.value = next;copyStatus.value = '';copiedText.value = '';}, async (source, mode) => {await new Promise(resolve => setTimeout(resolve, 600));return mockedSummary(source, mode);}, async (packet, mode) => {await new Promise(resolve => setTimeout(resolve, 700));return queue.save(packet, mode);});
 onUnmounted(() => {copyGeneration += 1;controller.dispose();});
 function locked(): boolean {return state.value.status === 'saving' || state.value.status === 'unverified';}
 async function copy(): Promise<void> {
  const draft = state.value.draft[0];if (!draft) {return;}
  const current = ++copyGeneration;const text = summaryText(draft);copiedText.value = text;copyStatus.value = '正在尝试复制；也可在下方选中文本。';
  try {if (!navigator.clipboard?.writeText) {throw new Error('clipboard unavailable');}await navigator.clipboard.writeText(text);if (current === copyGeneration) {copyStatus.value = '摘要已复制到剪贴板。';}} catch {if (current === copyGeneration) {copyStatus.value = '未能自动复制，请在下方选中文本后手动复制。';}}
 }
 function edit(field: 'issue' | 'expected', event: Event): void {if (event.target instanceof HTMLTextAreaElement) {controller.edit(field, event.target.value);}}
 const statusLabel: Record<State['status'], string> = {chat: '等待准备摘要', summarizing: '正在整理当前会话', review: '请核对并编辑，尚未保存', 'summary-error': '摘要被拒绝', saving: '正在保存确认的摘要', 'save-error': '写入前失败，草稿已保留', unverified: '入队结果待核对', queued: '已进入本页演示队列 · 未接通真人'};
 return () => h('main', [
  h('header', [h('p', {class: 'eyebrow'}, 'FRONTEND AGENT LAB / 12'), h('h1', 'Agent 解决不了，带着上下文转交'), h('p', {class: 'intro'}, '可编辑会话摘要与人工转接入口 · Vue 3 + TypeScript')]),
  h('aside', {class: 'notice'}, '纯浏览器离线演示。会话、模型、物流和队列均为模拟；没有上传、真实工单、客服通知或真人接入。刷新会清除全部记录。'),
  h('section', {class: 'workspace'}, [
   h('section', {class: 'panel'}, [
    h('div', {class: 'section-title'}, [h('span', {class: 'step'}, '01'), h('h2', '会话与转接条件'), h('strong', {id: 'version', class: 'version'}, `v${state.value.session.version}`)]),
    h('ol', {id: 'messages', class: 'messages'}, state.value.session.messages.map(item => h('li', {class: `message ${item.role}`, 'data-message-id': item.id}, [h('p', {class: 'meta'}, `${item.role === 'user' ? '用户' : '模拟工具'} · ${item.id}`), h('p', item.text)]))),
    h('div', {class: 'actions'}, [h('button', {id: 'query-fail', disabled: locked(), onClick: () => controller.query('failure')}, '模拟查询失败'), h('button', {id: 'query-success', disabled: locked(), onClick: () => controller.query('success')}, '模拟查询成功')]),
    h('p', {id: 'failures', class: 'meta'}, `连续失败：${state.value.session.failures} / 2；查询成功会归零。`),
    h('label', {for: 'message'}, '补充会话（仅演示文字，不发送）'),
    h('textarea', {id: 'message', value: message.value, rows: 2, maxlength: 300, disabled: locked(), onInput: (event: Event) => {if (event.target instanceof HTMLTextAreaElement) {message.value = event.target.value;}}}),
    h('div', {class: 'actions'}, [h('button', {id: 'add-message', disabled: locked(), onClick: () => {controller.addUser(message.value);message.value = '';}}, '加入本页会话'), h('button', {id: 'human', disabled: locked(), onClick: () => controller.requestHuman()}, '我希望转人工')]),
    h('p', {id: 'reason', class: eligible(state.value.session) ? 'reason ready' : 'reason'}, state.value.session.manual ? '用户主动要求转人工，可准备摘要。' : state.value.session.failures >= 2 ? '连续两次查询失败，建议准备转人工摘要；不会自动提交。' : '尚未达到失败阈值；用户仍可主动要求人工。'),
    h('button', {id: 'reset', disabled: locked(), onClick: () => controller.reset()}, '重置会话（保留已核对演示队列）'),
   ]),
   h('section', {class: 'panel'}, [
    h('div', {class: 'section-title'}, [h('span', {class: 'step'}, '02'), h('h2', '先核对摘要，再确认入队')]),
    h('label', {for: 'summary-mode'}, '固定摘要响应'),
    h('select', {id: 'summary-mode', value: summaryMode.value, disabled: locked(), onChange: (event: Event) => {if (event.target instanceof HTMLSelectElement) {summaryMode.value = event.target.value as SummaryMode;}}}, [h('option', {value: 'normal'}, '正常来源'), h('option', {value: 'forged-source'}, '模拟引用不存在的消息')]),
    h('button', {id: 'summarize', class: 'primary', disabled: locked() || !eligible(state.value.session), onClick: () => {void controller.summarize(summaryMode.value);}}, state.value.status === 'summarizing' ? '重新生成（替换上轮）' : '生成会话摘要'),
    h('div', {id: 'result', 'data-status': state.value.status, 'aria-live': 'polite'}, [
     h('p', {class: 'status'}, statusLabel[state.value.status]),
     state.value.error ? h('p', {id: 'error', class: 'error', role: 'alert'}, state.value.error) : '',
     state.value.draft.map(draft => h('div', {id: 'draft'}, [
      h('p', {id: 'draft-version', class: 'meta'}, `来源会话 v${draft.sourceVersion} · 摘要修订 ${draft.revision}；可编辑字段为用户确认内容，不是已核实业务事实。`),
      h('label', {for: 'issue'}, '问题摘要（可由用户编辑）'), h('textarea', {id: 'issue', value: draft.issue, rows: 3, maxlength: 300, disabled: locked() || state.value.status === 'queued', onInput: (event: Event) => edit('issue', event)}),
      h('label', {for: 'expected'}, '希望如何处理（可由用户编辑）'), h('textarea', {id: 'expected', value: draft.expected, rows: 3, maxlength: 300, disabled: locked() || state.value.status === 'queued', onInput: (event: Event) => edit('expected', event)}),
      h('details', {id: 'sources'}, [h('summary', '查看完整原始会话与尝试记录'), h('ol', draft.sources.map(item => h('li', [h('span', {class: 'meta'}, `${item.id} · ${item.role}`), h('blockquote', item.text)])))]),
      h('label', {for: 'save-mode'}, '模拟队列响应'),
      h('select', {id: 'save-mode', value: saveMode.value, disabled: state.value.status === 'saving' || state.value.status === 'queued', onChange: (event: Event) => {if (event.target instanceof HTMLSelectElement) {saveMode.value = event.target.value as SaveMode;}}}, [h('option', {value: 'normal'}, '正常保存与回执'), h('option', {value: 'fail-before-save'}, '明确写入前失败'), h('option', {value: 'bad-ack'}, '已写入但回执版本错误（结果待核对）')]),
      h('button', {id: 'confirm', class: 'primary', disabled: state.value.status === 'saving' || state.value.status === 'queued', onClick: () => {void controller.confirm(saveMode.value);}}, state.value.status === 'saving' ? '正在保存，请稍候' : state.value.status === 'unverified' ? '沿用同一编号重试核对' : state.value.status === 'save-error' ? '确认并重试保存' : '我已核对，确认加入演示队列'),
      state.value.operationId ? h('p', {id: 'operation', class: 'meta'}, `本次操作编号：${state.value.operationId}`) : '',
      h('button', {id: 'copy', onClick: () => {void copy();}}, '复制摘要 / 显示可选文本'),
      copiedText.value ? [h('p', {id: 'copy-status', role: 'status'}, copyStatus.value), h('label', {for: 'copy-text'}, '可选中后手动复制的摘要'), h('textarea', {id: 'copy-text', readonly: true, rows: 7, value: copiedText.value})] : '',
     ])),
     state.value.draft.length === 0 ? h('p', {class: 'empty'}, '这里只整理当前原始消息，不让模型补造处理承诺。会话变化后必须重新生成。') : '',
    ]),
    h('div', {class: 'boundary'}, [h('strong', '本轮能力边界'), h('p', '自动：整理与检查原文来源'), h('p', '需确认：保存用户核对后的摘要'), h('p', '不提供：真实工单 / 外部消息 / 真人接入')]),
   ]),
  ]),
  h('section', {class: 'panel'}, [h('h2', '已核对的本页演示队列'), h('p', {class: 'meta'}, '队列入队不等于真人已经接手；这里只显示回执已核对的记录。'), h('ol', {id: 'queue'}, state.value.queue.map(ticket => h('li', {class: 'ticket', 'data-ticket-id': ticket.ticketId}, [h('strong', `${ticket.ticketId} · ${ticket.operationId}`), h('p', ticket.issue), h('p', ticket.expected), h('p', {class: 'meta'}, `来源 v${ticket.sourceVersion} / 修订 ${ticket.revision} · queued-demo`)]))), h('p', {id: 'queue-count', class: 'meta'}, `已核对记录 ${state.value.queue.length} 条`)]),
  h('section', {class: 'panel trace-panel'}, [h('h2', '可核对的执行记录'), h('ol', {id: 'trace'}, state.value.trace.map(line => h('li', line)))]),
  h('footer', [h('p', '这是固定模拟摘要器和浏览器内存队列。引用存在只证明来自本页会话；用户编辑内容与业务事实仍需人工核实。'), h('a', {href: 'source.zip'}, '下载完整源码'), ' · ', h('a', {href: 'README.md'}, '运行说明')]),
 ]);
}}).mount('#app');
