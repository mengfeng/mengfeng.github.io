import { createApp, h, ref } from 'vue';
import { compareProducts, PRODUCTS, type Comparison, type Scenario } from './core';
const scenarios: readonly { value: Scenario; label: string }[] = [
  { value: 'success', label: '全部成功' }, { value: 'spec-failure', label: '第二件规格失败' },
  { value: 'stock-failure', label: '第三件库存失败' }, { value: 'out-of-stock', label: '第二件库存明确返回 0' },
  { value: 'unknown-id', label: '模型替换未知 ID' }, { value: 'html-text', label: '说明包含 HTML 文本' }
];
createApp({ setup() {
  const scenario = ref<Scenario>('success'), isRunning = ref(false), error = ref('');
  const result = ref<Comparison | false>(false);
  async function execute(): Promise<void> {
    if (isRunning.value) { return; } isRunning.value = true; result.value = false; error.value = '';
    try { result.value = await compareProducts(scenario.value); }
    catch (caught: unknown) { error.value = caught instanceof Error ? caught.message : '模拟比较失败。'; }
    finally { isRunning.value = false; }
  }
  function reset(): void { result.value = false; error.value = ''; }
  return () => h('main', [
    h('p', { class: 'eyebrow' }, 'FRONTEND AGENT LAB / 03'), h('h1', '同一张对比表，也要容得下未知'),
    h('p', { class: 'intro' }, '规格和库存分别查询。某个工具失败时，保留原来的商品行，明确缺少什么。全部模型决策、商品和工具均为本地固定模拟，无真实模型、网络请求或购买。'),
    h('section', { class: 'controls', 'aria-label': '演示设置' }, [
      h('label', { for: 'scenario' }, '选择验证场景'), h('select', { id: 'scenario', disabled: isRunning.value, value: scenario.value, onChange: (event: Event) => {
        const value = event.target instanceof HTMLSelectElement ? event.target.value : ''; const found = scenarios.find(item => item.value === value);
        if (found) { scenario.value = found.value; reset(); }
      } }, scenarios.map(item => h('option', { value: item.value }, item.label))),
      h('p', { class: 'request' }, '固定比较对象：' + PRODUCTS.map(product => product.id + ' ' + product.label).join(' / ')),
      h('button', { disabled: isRunning.value, onClick: execute }, isRunning.value ? '本地查询中…' : '运行模拟 Agent'),
      h('button', { class: 'secondary', disabled: isRunning.value, onClick: reset }, '重置结果'),
      h('small', '两类只读工具，每件各查一次：最多 6 次。20 / 60 毫秒本地延迟仅演示完成顺序不同，不代表真实接口耗时。')
    ]),
    error.value ? h('p', { role: 'alert', class: 'error' }, error.value) : h('span'),
    h('section', { 'aria-live': 'polite', 'aria-busy': isRunning.value }, result.value ? [
      h('p', { class: 'summary' }, result.value.summary),
      h('p', { class: 'call-count', 'data-planned': result.value.plannedCalls, 'data-executed': result.value.executedCalls }, `计划 ${result.value.plannedCalls} 个任务，实际执行 ${result.value.executedCalls} 次只读工具（参数被拦截的任务不执行）。`),
      h('div', { class: 'table-scroll', tabindex: 0, role: 'region', 'aria-label': '商品对比表，可横向滚动' }, [h('table', [
        h('caption', '三件演示通勤包：规格与库存按原请求 ID 汇合'),
        h('thead', [h('tr', ['商品', '规格（独立工具）', '库存（独立工具）', '模拟模型说明'].map(text => h('th', { scope: 'col' }, text)))]),
        h('tbody', result.value.rows.map(row => h('tr', { 'data-product-id': row.productId, key: row.productId }, [
          h('th', { scope: 'row' }, [h('strong', row.label), h('small', row.productId)]),
          h('td', { class: 'spec-cell', 'data-known': String(row.specs.ok) }, row.specs.ok
            ? [h('p', `¥${(row.specs.value.priceCents / 100).toFixed(2)}`), h('p', `${row.specs.value.capacityLiters} L / ${row.specs.value.weightGrams} g`)]
            : [h('strong', '规格未知'), h('p', { class: 'unknown' }, row.specs.error)]),
          h('td', { class: 'stock-cell', 'data-known': String(row.stock.ok) }, row.stock.ok
            ? row.stock.value === 0 ? [h('strong', '缺货 · 0 件')] : [h('strong', `有货 · ${row.stock.value} 件`)]
            : [h('strong', '库存未知'), h('p', { class: 'unknown' }, row.stock.error)]),
          h('td', { class: 'reason' }, row.reason)
        ])))
      ])]),
      h('h2', '汇总执行记录'), h('pre', { class: 'trace' }, result.value.trace.join('\n\n')),
      h('small', '记录在所有任务结束后按请求顺序汇总，不是实时进度或 token 流式输出。')
    ] : [h('p', { class: 'status' }, isRunning.value ? '等待本地工具任务结束…' : '选择场景后运行，观察缺失结果和零库存的区别。')]),
    h('footer', '虚构商品和库存不代表市场报价或可售承诺。模型说明仅为固定夹具；未评估真实模型。没有账户授权、库存预占、下单或付款。')
  ]);
} }).mount('#app');
