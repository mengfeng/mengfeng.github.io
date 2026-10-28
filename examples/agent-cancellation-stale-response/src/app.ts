import { createApp, h, ref, onUnmounted } from 'vue';
import { createSearchController, initialState, mockSearchTool, type SearchState, type Scenario } from './core';

createApp({ setup() {
  const query = ref('通勤包');
  const state = ref<SearchState>(initialState);
  const explanation = ref('输入“通勤”或“运动”搜索固定演示商品；其他条件会得到空结果。');
  const controller = createSearchController(mockSearchTool, next => { state.value = next; });
  let presetTimer: ReturnType<typeof setTimeout> | undefined;
  function clearPreset(): void { clearTimeout(presetTimer); presetTimer = undefined; }
  function run(): void { clearPreset(); explanation.value = '普通工具支持 AbortSignal；连续搜索将替换当前任务。'; void controller.start(query.value); }
  function stop(): void { clearPreset(); controller.stop(); }
  function preset(kind: 'normal' | 'race' | 'old-error' | 'stop' | 'invalid'): void {
    clearPreset();
    if (kind === 'race' || kind === 'old-error') {
      query.value = '通勤包';
      explanation.value = kind === 'race' ? '旧通勤查询忽略取消并等待 950ms；120ms 后启动运动查询，320ms 返回。最终必须保留运动包。' : '旧通勤查询忽略取消并在 950ms 报错；新运动查询先成功，旧错误不得改变页面。';
      void controller.start(query.value, kind === 'race' ? 'slow-ignore' : 'late-error');
      presetTimer = setTimeout(() => { presetTimer = undefined; query.value = '运动包'; void controller.start(query.value); }, 120);
      return;
    }
    query.value = '通勤包';
    const scenario: Scenario = kind === 'invalid' ? 'invalid' : kind === 'stop' ? 'slow-ignore' : 'normal';
    explanation.value = kind === 'invalid' ? '当前工具返回缺少价格的商品，前端校验后显示错误，不渲染半张卡片。' : kind === 'stop' ? '工具故意忽略取消，950ms 后仍返回；点击“停止接收结果”或等待 150ms 自动停止，卡片不能重新出现。' : '320ms 后返回当前通勤查询结果；这里只模拟工具耗时。';
    void controller.start(query.value, scenario);
    if (kind === 'stop') { presetTimer = setTimeout(() => { presetTimer = undefined; controller.stop(); }, 150); }
  }
  onUnmounted(() => { clearPreset(); controller.dispose(); });
  return () => h('main', [
    h('p', { class: 'eyebrow' }, 'FRONTEND AGENT LAB / 05'),
    h('h1', '只让当前任务更新页面'),
    h('p', { class: 'intro' }, '固定模拟模型决策 + 延迟只读工具。这里不调用真实模型、HTTP 接口或真实商品服务。AbortController 尝试停止工具，任务 ID 决定结果还能否进入页面。'),
    h('section', { class: 'controls' }, [
      h('form', { onSubmit: (event: Event) => { event.preventDefault(); run(); } }, [
        h('label', { for: 'query' }, '搜索条件（演示）'),
        h('input', { id: 'query', value: query.value, maxlength: 60, onInput: (event: Event) => { if (event.target instanceof HTMLInputElement) { query.value = event.target.value; } } }),
        h('div', { class: 'actions' }, [h('button', { type: 'submit', id: 'search' }, '查询 / 替换当前任务'), h('button', { type: 'button', id: 'stop', class: 'secondary', disabled: !state.value.busy, onClick: stop }, '停止接收结果')]),
      ]),
      h('p', { class: 'hint' }, '输入框只是待提交条件；点击查询才创建新任务。展示中的查询条件以结果区快照为准。'),
      h('label', '复现场景'),
      h('div', { class: 'presets' }, [
        h('button', { id: 'normal', class: 'secondary', onClick: () => preset('normal') }, '正常完成'),
        h('button', { id: 'race', class: 'secondary', onClick: () => preset('race') }, '旧慢新快'),
        h('button', { id: 'old-error', class: 'secondary', onClick: () => preset('old-error') }, '旧任务迟到报错'),
        h('button', { id: 'cancel-late', class: 'secondary', onClick: () => preset('stop') }, '停止后仍返回'),
        h('button', { id: 'invalid', class: 'secondary', onClick: () => preset('invalid') }, '当前数据不合法'),
      ]),
      h('p', { class: 'explanation', id: 'explanation' }, explanation.value),
    ]),
    h('section', { class: 'result', 'aria-live': 'polite', 'aria-busy': state.value.busy, 'data-task': state.value.taskId, 'data-status': state.value.status }, [
      h('div', { class: 'meta' }, [h('span', '任务 #' + state.value.taskId), h('span', { id: 'busy' }, state.value.busy ? '接收中' : '已结束 / 待命')]),
      h('h2', state.value.query ? '已提交条件：' + state.value.query : '等待提交条件'),
      h('p', { id: 'status', class: state.value.status === 'error' ? 'message error' : 'message', role: state.value.status === 'error' ? 'alert' : 'status' }, state.value.message),
      h('ul', { id: 'products', class: 'products' }, state.value.products.map(product => h('li', { key: product.id, 'data-product': product.id }, [h('strong', product.name), h('span', (product.priceFen / 100).toFixed(2) + ' 元 · 演示价格')]))),
    ]),
    h('footer', '停止仅阻止本页接收结果。工具可以忽略 signal，真实服务已执行的写操作也不会因此自动撤销。本例没有付款、退款、账号、持久化或对外通知。'),
  ]);
} }).mount('#app');
