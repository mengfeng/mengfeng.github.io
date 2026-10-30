import { ServiceError, accountValue, record, type Account, type Identity, type Order } from './service';
export type QueryResult = Readonly<{ identity: Identity; order: Order }>;
export type Api = { current: () => Promise<Identity | undefined>; login: (account: Account) => Promise<Identity>; logout: () => Promise<void>; query: (input: unknown) => Promise<QueryResult> };
export type UiState = Readonly<{ identity: Identity | undefined; order: Order | undefined; busy: boolean; status: 'guest' | 'working' | 'ready' | 'success' | 'error'; message: string }>;
export const initialUi: UiState = { identity: undefined, order: undefined, busy: false, status: 'guest', message: '先选择模拟账号，再查询固定演示订单。' };
export function createWorkflow(api: Api, publish: (state: UiState) => void) {
  let state = initialUi; let operation = 0; let disposed = false; let changingIdentity = false;
  function emit(next: UiState): void { if (!disposed) { state = next; publish(next); } }
  async function init(): Promise<void> {
    const id = operation;
    try { const identity = await api.current(); if (id === operation && !disposed) { emit({ ...initialUi, identity, status: identity ? 'ready' : 'guest' }); } }
    catch { if (id === operation && !disposed) { emit(initialUi); } }
  }
  async function choose(account: Account): Promise<void> {
    if (disposed || changingIdentity) { return; }
    const id = ++operation; changingIdentity = true;
    emit({ identity: undefined, order: undefined, busy: true, status: 'working', message: '正在切换模拟身份；旧结果已清除。' });
    try {
      const identity = await api.login(account);
      if (id === operation && !disposed) { emit({ identity, order: undefined, busy: false, status: 'ready', message: '当前为 ' + identity.label + '；模型没有选择账号的权限。' }); }
    } catch (error: unknown) { if (id === operation && !disposed) { emit({ ...initialUi, status: 'error', message: error instanceof Error ? error.message : '模拟登录失败。' }); } }
    finally { changingIdentity = false; }
  }
  async function logout(): Promise<void> {
    if (disposed || changingIdentity) { return; }
    const id = ++operation; changingIdentity = true;
    emit({ ...initialUi, busy: true, status: 'working', message: '正在退出；旧结果已清除。' });
    try { await api.logout(); if (id === operation && !disposed) { emit({ ...initialUi, message: '已退出模拟会话。' }); } }
    catch (error: unknown) { if (id === operation && !disposed) { emit({ ...initialUi, status: 'error', message: error instanceof Error ? error.message : '退出失败，请重试。' }); } }
    finally { changingIdentity = false; }
  }
  async function query(input: unknown): Promise<void> {
    if (disposed || changingIdentity) { return; }
    const id = ++operation; const selected = state.identity;
    emit({ identity: selected, order: undefined, busy: true, status: 'working', message: '固定模拟 Agent 选择只读订单工具，等待权限检查…' });
    try {
      const result = await api.query(input);
      if (id === operation && !disposed) { emit({ identity: result.identity, order: result.order, busy: false, status: 'success', message: '仅展示当前会话有权访问的演示订单。' }); }
    } catch (error: unknown) { if (id === operation && !disposed) { emit({ identity: error instanceof ServiceError && error.status === 401 ? undefined : selected, order: undefined, busy: false, status: 'error', message: error instanceof Error ? error.message : '演示查询失败。' }); } }
  }
  return { init, choose, logout, query, getState: () => state, dispose: () => { disposed = true; ++operation; } };
}
export function parseIdentity(raw: unknown): Identity { const x = record(raw); const account = accountValue(x.account); if (x.label !== '演示账号 ' + account) { throw new Error('身份响应不合法。'); } return { account, label: x.label }; }
export function parseOrder(raw: unknown): Order {
  const x = record(raw);
  if (typeof x.orderId !== 'string' || !/^DEMO-[AB]-\d{4}$/.test(x.orderId) || typeof x.item !== 'string' || x.item.length > 80 || !x.item.startsWith('演示') || typeof x.status !== 'string' || x.status.length > 40 || !x.status.startsWith('演示')) { throw new Error('订单响应未通过结构校验。'); }
  return { orderId: x.orderId, item: x.item, status: x.status };
}

export function parseQueryResult(raw: unknown): QueryResult { const x = record(raw); return { identity: parseIdentity(x.identity), order: parseOrder(x.order) }; }
