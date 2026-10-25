import { createApp, h, ref } from 'vue';
import { ORDERS, ISSUES, startSession, selectOrder, selectIssue, runSession, type Scenario } from './core';

const scenarios: readonly { value: Scenario; label: string }[] = [
  { value: 'ambiguous', label: '多订单，先追问' }, { value: 'unknown-order', label: '模型给未知订单' },
  { value: 'unknown-issue', label: '模型给未知问题' }, { value: 'premature-ready', label: '模型跳过追问' },
  { value: 'tool-error', label: '政策查询失败与重试' }, { value: 'html-text', label: '追问包含 HTML 文本' }
];
createApp({
  setup() {
    const scenario = ref<Scenario>('ambiguous');
    const session = ref(startSession());
    const isRunning = ref(false);
    const opened = ref(false);
    function reset(): void { session.value = startSession(); opened.value = false; }
    async function execute(): Promise<void> {
      if (isRunning.value) { return; }
      isRunning.value = true; opened.value = false;
      // 本地延迟仅用于显示加载态，不代表模型耗时或流式输出。
      await new Promise<void>(resolve => setTimeout(resolve, 200));
      session.value = runSession(session.value, scenario.value, session.value.policyAttempts + 1);
      isRunning.value = false;
    }
    function chooseOrder(id: string): void {
      session.value = selectOrder(session.value, id); opened.value = false;
      void execute();
    }
    function chooseIssue(value: string): void {
      session.value = selectIssue(session.value, value); opened.value = false;
      void execute();
    }
    return () => h('main', [
      h('p', { class: 'eyebrow' }, 'FRONTEND AGENT LAB / 02'), h('h1', '不知道是哪一单，就先问清楚'),
      h('p', { class: 'intro' }, '“这个东西有问题。”在选定订单与问题类型前，应用会拦住政策查询。模型响应、订单和政策全部为本地固定演示数据，无真实模型或售后服务。'),
      h('section', { class: 'controls', 'aria-label': '演示设置' }, [
        h('label', { for: 'scenario' }, '选择验证场景'),
        h('select', { id: 'scenario', disabled: isRunning.value, value: scenario.value, onChange: (event: Event) => {
          const value = event.target instanceof HTMLSelectElement ? event.target.value : '';
          const found = scenarios.find(item => item.value === value);
          if (found) { scenario.value = found.value; reset(); }
        } }, scenarios.map(item => h('option', { value: item.value }, item.label))),
        h('p', { class: 'request' }, '固定用户诉求：“这个东西有问题，帮我处理一下。”'),
        h('button', { disabled: isRunning.value, onClick: execute }, isRunning.value ? '本地模拟中…' : '运行模拟 Agent'),
        h('button', { class: 'secondary', disabled: isRunning.value, onClick: reset }, '重置选择'),
        h('small', '选择场景 → 运行 → 选订单 → 选问题类型。异常场景用于观察边界；恢复正常场景可重新开始。')
      ]),
      h('section', { class: 'conversation', 'aria-live': 'polite', 'aria-busy': isRunning.value }, [
        h('p', { class: session.value.stage === 'error' ? 'message error' : 'message', role: session.value.stage === 'error' ? 'alert' : 'status' }, session.value.message),
        h('p', { class: 'summary' }, `已选订单：${session.value.orderId || '未选择'} ｜ 问题类型：${session.value.issue || '未选择'}`),
        h('p', { class: 'tool-count', 'data-count': session.value.toolCalls }, `本会话政策工具调用：${session.value.toolCalls} 次`),
        session.value.stage !== 'idle' ? h('div', { class: 'choice-group' }, [h('h2', '明确选择订单'),
          ...ORDERS.map(order => h('button', { class: session.value.orderId === order.id ? 'choice selected' : 'choice', disabled: isRunning.value, 'data-order': order.id, onClick: () => chooseOrder(order.id) }, order.label))]) : h('span'),
        session.value.orderId ? h('div', { class: 'choice-group' }, [h('h2', '明确选择问题类型'),
          ...ISSUES.map(issue => h('button', { class: session.value.issue === issue.value ? 'choice selected' : 'choice', disabled: isRunning.value, 'data-issue': issue.value, onClick: () => chooseIssue(issue.value) }, issue.label))]) : h('span'),
        session.value.stage === 'error' && scenario.value === 'tool-error' ? h('button', { class: 'retry', disabled: isRunning.value, onClick: execute }, '重试只读政策查询') : h('span'),
        session.value.policyText ? h('article', { class: 'policy' }, [h('h2', '演示政策与入口'), h('p', session.value.policyText),
          h('button', { class: 'entry', onClick: () => { opened.value = true; } }, session.value.entry),
          opened.value ? h('p', { class: 'entry-preview' }, '本地资料核对预览：请人工核对照片与订单。本演示没有创建申请、退款或通知任何人。') : h('span')]) : h('span')
      ]),
      h('section', { class: 'protocol' }, [h('h2', '本次执行记录（最多保留 15 条）'), h('pre', session.value.trace.join('\n\n') || '尚未运行。用户槽位与模型建议分开保存。')]),
      h('footer', '选择变化会清空旧问题、政策和入口。这里没有自然语言理解、真实账号授权、外部请求或业务提交。')
    ]);
  }
}).mount('#app');
