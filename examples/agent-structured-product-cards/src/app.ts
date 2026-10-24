import { createApp, h, ref } from 'vue';
import { runDemo, type Card, type Scenario } from './core';

const scenarios: readonly { value: Scenario; title: string }[] = [
  { value: 'success', title: '正常推荐' }, { value: 'unknown-id', title: '模型编造 ID' },
  { value: 'missing-price', title: '工具缺少价格' }, { value: 'injection', title: '恶意 HTML 文本' },
  { value: 'tool-error', title: '服务失败与重试' }, { value: 'invalid-json', title: '无效 JSON' }
];

createApp({
  setup() {
    const scenario = ref<Scenario>('success');
    const cards = ref<Card[]>([]);
    const trace = ref<string[]>([]);
    const error = ref('');
    const isRunning = ref(false);
    const hasRun = ref(false);
    const attempt = ref(0);

    async function execute(isRetry: boolean): Promise<void> {
      if (isRunning.value) { return; }
      attempt.value = isRetry ? attempt.value + 1 : 1;
      cards.value = [];
      error.value = '';
      trace.value = [];
      hasRun.value = true;
      isRunning.value = true;
      // 本地延时只用于观察加载状态，不代表模型 token 流式输出。
      await new Promise<void>(resolve => setTimeout(resolve, 350));
      const result = runDemo(scenario.value, attempt.value);
      trace.value = result.trace;
      if (result.ok) { cards.value = result.cards; } else { error.value = result.message; }
      isRunning.value = false;
    }

    return () => h('main', [
      h('p', { class: 'eyebrow' }, 'FRONTEND AGENT LAB / 01'),
      h('h1', '把 Agent 的答案变成商品卡片'),
      h('p', { class: 'intro' }, '模型负责挑选和解释，名称与价格由本次商品工具结果提供。这个演示全部在浏览器本地运行，模型响应和商品均为固定模拟数据。'),
      h('section', { class: 'controls', 'aria-label': '演示设置' }, [
        h('label', { for: 'scenario' }, '选择验证场景'),
        h('select', { id: 'scenario', disabled: isRunning.value, value: scenario.value, onChange: (event: Event) => {
          const value = event.target instanceof HTMLSelectElement ? event.target.value : '';
          const selected = scenarios.find(item => item.value === value);
          if (selected) { scenario.value = selected.value; cards.value = []; trace.value = []; error.value = ''; hasRun.value = false; attempt.value = 0; }
        } }, scenarios.map(item => h('option', { value: item.value }, item.title))),
        h('p', { class: 'request' }, '用户诉求：推荐 500 元以内的通勤双肩包。'),
        h('button', { disabled: isRunning.value, onClick: () => execute(false) }, isRunning.value ? '本地模拟运行中…' : '运行模拟 Agent'),
        error.value ? h('button', { class: 'secondary', disabled: isRunning.value, onClick: () => execute(true) }, '重试只读查询') : h('span'),
        h('small', '“服务失败与重试”第一次故意失败，重试后恢复；其他协议错误重试仍会被拦下。')
      ]),
      h('section', { 'aria-live': 'polite', 'aria-busy': isRunning.value }, [
        error.value ? h('p', { class: 'error', role: 'alert' }, error.value) : h('p', { class: 'status' }, isRunning.value ? '正在验证本地模拟数据…' : cards.value.length ? `验证通过 · ${cards.value.length} 张卡片 · 第 ${attempt.value} 次运行` : hasRun.value ? '没有可展示的商品。' : '选择场景后运行，观察结果与协议边界。'),
        h('div', { class: 'cards' }, cards.value.map(card => h('article', { class: 'card', key: card.id }, [
          h('span', { class: 'bag', 'aria-hidden': 'true' }, '🎒'),
          h('small', card.id), h('h2', card.name), h('p', { class: 'price' }, `¥${(card.priceCents / 100).toFixed(2)}`),
          // h() 的字符串子节点按文本渲染，永远不把模型 reason 交给 innerHTML。
          h('p', { class: 'reason' }, card.reason), h('small', '名称 / 价格：本次商品工具结果')
        ])))
      ]),
      h('section', { class: 'protocol' }, [h('h2', '本次执行记录'),
        trace.value.length ? h('pre', trace.value.join('\n\n')) : h('p', 'function_call → 只读工具 → 最终 JSON → unknown 校验 → Vue 文本节点')]),
      h('footer', '这是协议与 UI 边界演示，不包含真实模型、网络请求、库存校验、购买或支付。')
    ]);
  }
}).mount('#app');
