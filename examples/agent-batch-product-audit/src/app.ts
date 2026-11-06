import { createApp, h, onBeforeUnmount, shallowRef } from 'vue';
import { createBatchController, makeMockTool, makePlan, PRODUCTS, ISSUE_TEXT, type Snapshot, type RowStatus } from './core';
const LABELS: Record<RowStatus, string> = { waiting: '待开始', queued: '排队中', running: '检查中', pass: '规则通过', issues: '资料待补齐', retryable: '执行失败', error: '需人工核查' };
createApp({ setup() {
  const mode = shallowRef('normal');
  const view = shallowRef<Snapshot>({ batchId: 0, state: 'idle', rows: [], calls: 0, active: 0, peak: 0, error: '', trace: [] });
  let activeTool = makeMockTool();
  const controller = createBatchController((request, signal) => activeTool(request, signal), state => { view.value = state; }, { timeoutMs: 700 });
  onBeforeUnmount(() => controller.dispose());
  const start = (): void => {
    if (view.value.state !== 'idle') { return; }
    activeTool = makeMockTool(mode.value === 'forged-result' ? 'forged-result' : mode.value === 'persistent-failure' ? 'persistent-failure' : 'normal');
    const plan = mode.value === 'bad-plan' ? { tool: 'delete_product', productIds: ['P01'] } : makePlan();
    void controller.start(plan);
  };
  return () => {
    const s = view.value;
    const settled = s.rows.filter(row => ['pass', 'issues', 'retryable', 'error'].includes(row.status)).length;
    const pass = s.rows.filter(row => row.status === 'pass').length;
    const issues = s.rows.filter(row => row.status === 'issues').length;
    const retryable = s.rows.filter(row => row.status === 'retryable' && row.attempts < 2).length;
    const failures = s.rows.filter(row => row.status === 'retryable' || row.status === 'error').length;
    return h('main', [
      h('header', [h('p', { class: 'eyebrow' }, 'FRONTEND AGENT LAB / 13'), h('h1', '十件商品，三条检查通道'), h('p', { class: 'intro' }, '批量检查商品资料 · 部分失败保留结果 · 只重试可恢复项')]),
      h('aside', { class: 'notice' }, '离线演示：计划是固定模拟输出，商品为虚构数据。仅按固定规则检查缺项，不调用模型、不读取真实商城、不修改商品。刷新会清空结果。'),
      h('section', { class: 'panel control' }, [
        h('div', [h('label', { for: 'mode' }, '演示场景'), h('select', { id: 'mode', disabled: s.state !== 'idle', value: mode.value, onChange: (e: Event) => { mode.value = (e.target as HTMLSelectElement).value; } }, [h('option', { value: 'normal' }, '正常计划 + 两项首次执行失败'), h('option', { value: 'bad-plan' }, '拒绝未授权工具计划'), h('option', { value: 'forged-result' }, '拒绝 P05 的伪造商品回执'), h('option', { value: 'persistent-failure' }, 'P03 持续失败，观察重试上限')])]),
        h('div', { class: 'actions' }, [h('button', { id: 'start', class: 'primary', disabled: s.state !== 'idle', onClick: start }, '开始检查 10 件'), h('button', { id: 'retry', disabled: s.state !== 'done' || retryable === 0, onClick: () => { void controller.retryFailed(); } }, `只重试失败项（${retryable}）`), h('button', { id: 'reset', disabled: s.state === 'draining', onClick: () => controller.reset() }, s.state === 'running' ? '停止并重置' : '重置演示')]),
        h('p', { id: 'batch-state', 'data-state': s.state, class: 'meta', role: 'status' }, s.state === 'draining' ? '正在中止并等待在途工具结束，请稍候。' : s.state === 'done' ? '本轮处理完成；请区分资料缺项与执行失败。' : s.state === 'running' ? '正在检查，各商品结果独立更新。' : '准备就绪，每件商品最多调用 2 次。'),
        s.error ? h('p', { id: 'error', class: 'error', role: 'alert' }, s.error) : [],
      ]),
      h('section', { class: 'metrics', 'aria-label': '批次统计' }, [
        h('div', [h('span', '本轮已处理'), h('strong', { id: 'progress' }, `${settled} / ${s.rows.length || 10}`)]),
        h('div', [h('span', '运行中 / 上限'), h('strong', { id: 'active' }, `${s.active} / 3`)]),
        h('div', [h('span', '并发峰值'), h('strong', { id: 'peak' }, String(s.peak))]),
        h('div', [h('span', '本批次调用 / 上限'), h('strong', { id: 'calls' }, `${s.calls} / 20`)]),
      ]),
      h('p', { id: 'outcome', class: 'outcome' }, `规则通过 ${pass} · 资料待补齐 ${issues} · 执行失败或待核查 ${failures}。已处理不等于全部通过；重试中的条目会重新计为处理中。`),
      h('section', { id: 'rows', class: 'rows', 'aria-label': '逐项检查结果' }, PRODUCTS.map(product => {
        const row = s.rows.find(item => item.id === product.id);
        return h('article', { class: 'product', key: product.id, 'data-id': product.id, 'data-status': row?.status || 'waiting' }, [
          h('div', { class: 'product-head' }, [h('span', { class: 'code' }, product.id), h('h2', product.title || '（标题缺失）'), h('span', { class: `badge ${row?.status || 'waiting'}` }, LABELS[row?.status || 'waiting'])]),
          h('p', { class: 'meta' }, `图片说明：${product.imageAlt || '未填写'} · 规格：${product.spec || '未填写'}`),
          row?.issues.length ? h('ul', { class: 'issues' }, row.issues.map(issue => h('li', ISSUE_TEXT[issue]))) : [],
          row?.message ? h('p', { class: 'error' }, row.message) : [],
          h('p', { class: 'attempts' }, `调用 ${row?.attempts || 0} / 2${row?.status === 'retryable' && row.attempts === 2 ? ' · 已达上限，请人工核查' : ''}`),
        ]);
      })),
      h('section', { class: 'panel trace-panel' }, [h('h2', '调用记录'), h('ol', { id: 'trace' }, s.trace.map(line => h('li', line))), !s.trace.length ? h('p', { class: 'meta' }, '等待开始；无效计划不会调用工具。') : []]),
      h('footer', '超时通过 AbortController 请求中止，本地模拟工具配合停止后才释放通道。真实远端是否停止，需要服务端确认；浏览器并发限制也不能代替服务端全局限流。'),
    ]);
  };
} }).mount('#app');
