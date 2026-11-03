import {createApp, h, ref} from 'vue';
import {CATALOG, THRESHOLD_CENTS, createController, initialCart, mockedPlan, product, subtotal, type Mode, type State} from './core';
function money(cents: number): string {return `¥${(cents / 100).toFixed(2)}`;}
createApp({setup() {
 const state = ref<State>({cart: initialCart(1), status: 'idle', requestedVersion: 0, suggestion: [], error: '', trace: []});
 const mode = ref<Mode>('normal');
 const latency = ref(900);
 const controller = createController(next => {state.value = next;}, async (cart, selected) => {
  const delay = latency.value;
  await new Promise(resolve => setTimeout(resolve, delay));
  return mockedPlan(cart, selected);
 });
 function quantity(sku: string): number {return state.value.cart.lines.find(line => line.sku === sku)?.quantity ?? 0;}
 return () => h('main', [
  h('header', [h('p', {class: 'eyebrow'}, 'FRONTEND AGENT LAB / 11'), h('h1', '建议属于哪个购物车版本？'), h('p', {class: 'intro'}, '购物车凑单助手 · Vue 3 + TypeScript · 纯浏览器离线演示')]),
  h('aside', {class: 'notice'}, '商品、库存、包邮规则和模型响应均为教学模拟数据。本页只展示建议；没有自动加购、下单、付款或真实模型 API。'),
  h('section', {class: 'workspace'}, [
   h('section', {class: 'panel'}, [
    h('div', {class: 'section-title'}, [h('span', {class: 'step'}, '01'), h('h2', '当前购物车'), h('strong', {id: 'revision', class: 'version'}, `v${state.value.cart.version}`)]),
    h('p', {class: 'meta'}, '编辑同步递增版本；即使改回原数量，旧版本也不会复活。'),
    h('div', {id: 'cart'}, CATALOG.map(item => h('article', {class: 'cart-line', 'data-sku': item.sku}, [
     h('div', {class: 'item-info'}, [h('strong', item.name), h('p', {class: 'meta'}, `${money(item.priceCents)} / 件 · 演示库存 ${item.stock}`)]),
     h('div', {class: 'quantity'}, [h('button', {'data-action': 'minus', disabled: quantity(item.sku) === 0, 'aria-label': `减少${item.name}`, onClick: () => controller.setQuantity(item.sku, quantity(item.sku) - 1)}, '−'), h('output', {class: 'qty', 'aria-label': `${item.name}数量`}, String(quantity(item.sku))), h('button', {'data-action': 'plus', disabled: quantity(item.sku) >= item.stock, 'aria-label': `增加${item.name}`, onClick: () => controller.setQuantity(item.sku, quantity(item.sku) + 1)}, '+')]),
    ]))),
    h('div', {class: 'totals'}, [h('span', '当前商品合计'), h('strong', {id: 'subtotal'}, money(subtotal(state.value.cart)))]),
    h('p', {class: 'meta'}, `演示包邮门槛 ${money(THRESHOLD_CENTS)}；只计商品金额，无优惠、税费和运费结算。`),
    h('div', {class: 'actions'}, [h('button', {id: 'reset', onClick: () => controller.reset()}, '恢复初始车（新版本）'), h('button', {id: 'empty', onClick: () => controller.empty()}, '清空购物车')]),
   ]),
   h('section', {class: 'panel'}, [
    h('div', {class: 'section-title'}, [h('span', {class: 'step'}, '02'), h('h2', '只读凑单建议')]),
    h('label', {for: 'latency'}, '模拟响应延迟'),
    h('select', {id: 'latency', value: String(latency.value), onChange: (event: Event) => {if (event.target instanceof HTMLSelectElement) {latency.value = Number(event.target.value);}}}, [h('option', {value: '900'}, '900 毫秒'), h('option', {value: '2500'}, '2500 毫秒（方便中途编辑）')]),
    h('label', {for: 'mode'}, '固定模拟响应 / 故障注入'),
    h('select', {id: 'mode', value: mode.value, onChange: (event: Event) => {if (event.target instanceof HTMLSelectElement) {mode.value = event.target.value as Mode; controller.invalidate();}}}, [h('option', {value: 'normal'}, '正常只读查询'), h('option', {value: 'unknown-sku'}, '工具返回未知商品'), h('option', {value: 'tampered-cost'}, '工具返回错误金额'), h('option', {value: 'stale-version'}, '工具伪造快照版本'), h('option', {value: 'multiple-calls'}, '模型请求多次工具')]),
    h('button', {id: 'generate', class: 'primary', onClick: () => {void controller.generate(mode.value);}}, state.value.status === 'running' ? '重新查询（替换前一请求）' : '按当前版本查询建议'),
    h('div', {id: 'result', 'data-status': state.value.status, 'aria-live': 'polite'}, [
     h('p', {class: 'status'}, {idle: '等待查询', running: `正在查询 v${state.value.requestedVersion}`, current: `建议对应当前 v${state.value.cart.version}`, stale: '建议已过期', error: '本轮结果被拒绝'}[state.value.status]),
     state.value.status === 'stale' ? h('div', {id: 'stale', class: 'stale'}, [h('strong', '购物车已经变化，请重新查询。'), h('p', `旧请求/建议 v${state.value.requestedVersion} → 当前 v${state.value.cart.version}。旧结论已隐藏。`)]) : '',
     state.value.error ? h('p', {id: 'error', role: 'alert', class: 'error'}, state.value.error) : '',
     state.value.status === 'current' ? state.value.suggestion.map(suggestion => h('article', {id: 'suggestion'}, [
      h('p', {id: 'source-version', class: 'meta'}, `来源：购物车快照 v${suggestion.sourceVersion}`),
      suggestion.kind === 'topup' ? [h('h3', `${product(suggestion.sku).name} × ${suggestion.quantity}`), h('dl', [h('dt', '当前差额'), h('dd', {id: 'gap'}, money(suggestion.gapCents)), h('dt', '建议新增'), h('dd', {id: 'added'}, money(suggestion.addedCents)), h('dt', '模拟商品总计'), h('dd', {id: 'final'}, money(suggestion.finalCents))]), h('p', {class: 'meta'}, '在单个候选 SKU 的若干件方案中，先比较新增金额，再比较件数。没有执行加购。')] : h('p', {id: 'no-topup'}, {covered: '当前已达到演示门槛，无需凑单。', empty: '购物车为空，请先自行选择商品。', unavailable: '没有库存足够的单 SKU 达标方案，请人工调整。'}[suggestion.kind]),
     ])) : '',
     state.value.status === 'idle' ? h('p', {class: 'empty'}, '查询期间可以继续改数量。版本变化会使旧任务和旧建议立即失效。') : '',
    ]),
    h('div', {class: 'boundary'}, [h('strong', '本轮能力边界'), h('p', '允许：findTopup × 1（只读当前快照）'), h('p', '不提供：自动加购 / 下单 / 付款')]),
   ]),
  ]),
  h('section', {class: 'panel trace-panel'}, [h('h2', '请求与版本记录'), h('ol', {id: 'trace'}, state.value.trace.map(line => h('li', line))), state.value.trace.length === 0 ? h('p', {class: 'meta'}, '运行一次查询，查看快照版本和校验记录。') : '']),
  h('footer', [h('p', '离线固定模型计划与确定性工具，不代表真实模型或生产库存。刷新页面恢复初始数据；版本号只在当前页面有效。'), h('a', {href: 'source.zip'}, '下载完整源码'), ' · ', h('a', {href: 'README.md'}, '运行说明')]),
 ]);
}}).mount('#app');
