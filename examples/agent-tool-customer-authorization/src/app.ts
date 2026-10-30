import { createApp, h, onUnmounted, ref } from 'vue';
import { ServiceError, createOrderService, type Account } from './service';
import { createWorkflow, initialUi, parseIdentity, parseQueryResult, type Api, type UiState } from './core';
const local = createOrderService(() => crypto.randomUUID()); let token = '';
const offlineApi: Api = {
  current: async () => { try { return local.identity(token); } catch { return undefined; } },
  login: async account => { local.logout(token); const result = local.login({ account }); token = result.token; return result.identity; },
  logout: async () => { local.logout(token); token = ''; },
  query: async input => { const capturedToken = token; await new Promise(resolve => setTimeout(resolve, 250)); return { identity: local.identity(capturedToken), order: local.query(capturedToken, input) }; },
};
const isHttp = location.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(location.hostname) && location.port === '8090';
async function request(url: string, input: unknown): Promise<unknown> {
  const response = await fetch(url, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  const raw: unknown = await response.json();
  if (!response.ok) { const x = typeof raw === 'object' && raw !== null && 'error' in raw ? raw.error : ''; throw new ServiceError(response.status, typeof x === 'string' ? x : '本地服务请求失败。'); }
  return raw;
}
const httpApi: Api = { current: async () => { try { return parseIdentity(await request('/api/session', {})); } catch { return undefined; } }, login: async account => parseIdentity(await request('/api/demo-login', { account })), logout: async () => { await request('/api/demo-logout', {}); }, query: async input => parseQueryResult(await request('/api/order-tool', input)) };
createApp({ setup() {
  const state = ref<UiState>(initialUi); const input = ref('DEMO-A-1001'); const workflow = createWorkflow(isHttp ? httpApi : offlineApi, x => { state.value = x; });
  void workflow.init();
  const changing = ref(false);
  async function choose(account: Account): Promise<void> { changing.value = true; try { await workflow.choose(account); } finally { changing.value = false; } }
  async function logout(): Promise<void> { changing.value = true; try { await workflow.logout(); } finally { changing.value = false; } }
  function run(orderId: string): void { input.value = orderId; void workflow.query({ orderId }); }
  onUnmounted(() => workflow.dispose());
  return () => h('main', [h('p', { class: 'eyebrow' }, 'FRONTEND AGENT LAB / 07'), h('h1', '订单号不是通行证'),
    h('p', { class: 'intro' }, '固定模拟 Agent 只选择只读工具。账号来自演示会话，模型参数不能指定账号。全部订单都是公开编写的假数据。'),
    h('p', { id: 'mode', class: 'hint' }, isHttp ? '模式：本地 HTTP / HttpOnly Cookie 演示会话（8090）' : '模式：离线规则模拟 / 无业务接口请求。公开包内含全部演示数据，不构成保密或真实鉴权。'),
    h('section', { class: 'controls' }, [h('h2', '模拟身份（无需密码，不是真实登录）'), h('div', { class: 'actions' }, [h('button', { id: 'login-a', disabled: changing.value, onClick: () => void choose('A') }, '选择演示账号 A'), h('button', { id: 'login-b', disabled: changing.value, onClick: () => void choose('B') }, '选择演示账号 B'), h('button', { id: 'logout', disabled: changing.value, onClick: () => void logout() }, '退出模拟会话')]),
      h('p', { id: 'identity' }, state.value.identity?.label || '未登录 / 身份待确认'), h('label', { for: 'order-id' }, '订单号'), h('input', { id: 'order-id', maxlength: 20, value: input.value, onInput: (e: Event) => { if (e.target instanceof HTMLInputElement) { input.value = e.target.value; } } }),
      h('div', { class: 'actions' }, [h('button', { id: 'query', disabled: changing.value, onClick: () => run(input.value) }, '查询演示订单'), h('button', { id: 'own', disabled: changing.value, onClick: () => run(state.value.identity?.account === 'B' ? 'DEMO-B-2001' : 'DEMO-A-1001') }, '查询当前账号示例'), h('button', { id: 'other', disabled: changing.value, onClick: () => run(state.value.identity?.account === 'B' ? 'DEMO-A-1001' : 'DEMO-B-2001') }, '查询另一账号订单'), h('button', { id: 'missing', disabled: changing.value, onClick: () => run('DEMO-A-9999') }, '查询不存在订单'), h('button', { id: 'forge', disabled: changing.value, onClick: () => void workflow.query({ orderId: 'DEMO-B-2001', customerId: 'B' }) }, '模型伪造 customerId')]),
    ]), h('section', { class: 'result', 'aria-live': 'polite', 'aria-busy': state.value.busy, 'data-status': state.value.status }, [h('p', { id: 'status', role: state.value.status === 'error' ? 'alert' : 'status' }, state.value.message), ...(state.value.order ? [h('div', { id: 'order' }, [h('h2', state.value.order.orderId), h('p', state.value.order.item), h('p', state.value.order.status)])] : [])]),
    h('footer', '仅本地 HTTP 路径验证浏览器到 Node 的会话和权限边界。演示登录可任意选择 A/B，无真实认证；内存会话 5 分钟过期、最多 64 个，重启清空。没有真实模型、订单写入、数据库或对外消息。'),
  ]);
} }).mount('#app');
