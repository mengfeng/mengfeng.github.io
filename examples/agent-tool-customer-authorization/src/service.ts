export type Account = 'A' | 'B';
export type Identity = Readonly<{ account: Account; label: string }>;
export type Order = Readonly<{ orderId: string; item: string; status: string }>;
export class ServiceError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}
export function record(raw: unknown): Record<string, unknown> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) { throw new ServiceError(400, '请求必须是对象。'); }
  return raw as Record<string, unknown>;
}
export function accountValue(raw: unknown): Account {
  if (raw !== 'A' && raw !== 'B') { throw new ServiceError(400, '仅可选择演示账号 A 或 B。'); }
  return raw;
}
export function orderInput(raw: unknown): string {
  const x = record(raw);
  if (Object.keys(x).length !== 1 || typeof x.orderId !== 'string' || !/^DEMO-[AB]-\d{4}$/.test(x.orderId)) { throw new ServiceError(400, '工具只接受 orderId，格式如 DEMO-A-1001。'); }
  return x.orderId;
}
// All fixtures are public examples. The browser's offline bundle includes both orders.
const orders: readonly (Order & { owner: Account })[] = [
  { owner: 'A', orderId: 'DEMO-A-1001', item: '演示通勤包', status: '演示待发货' },
  { owner: 'B', orderId: 'DEMO-B-2001', item: '演示运动水杯', status: '演示已发货' },
];
export function createOrderService(makeToken: () => string, now: () => number = Date.now) {
  const sessions = new Map<string, { account: Account; expiresAt: number }>();
  function login(raw: unknown): { token: string; identity: Identity } {
    const x = record(raw);
    if (Object.keys(x).length !== 1) { throw new ServiceError(400, '模拟登录只接受 account。'); }
    const account = accountValue(x.account);
    for (const [key, value] of sessions) { if (value.expiresAt <= now()) { sessions.delete(key); } }
    if (sessions.size >= 64) { throw new ServiceError(429, '演示会话达到上限，请退出旧会话或重启。'); }
    const token = makeToken();
    if (!token || sessions.has(token)) { throw new ServiceError(500, '演示令牌生成失败。'); }
    sessions.set(token, { account, expiresAt: now() + 300000 });
    return { token, identity: { account, label: '演示账号 ' + account } };
  }
  function identity(token: string): Identity {
    const session = sessions.get(token);
    if (!session || session.expiresAt <= now()) { sessions.delete(token); throw new ServiceError(401, '请先选择模拟账号，会话可能已退出或过期。'); }
    return { account: session.account, label: '演示账号 ' + session.account };
  }
  function logout(token: string): void { sessions.delete(token); }
  function query(token: string, raw: unknown): Order {
    const current = identity(token); // Only the server-held session supplies the owner.
    const orderId = orderInput(raw);
    const found = orders.find(order => order.orderId === orderId && order.owner === current.account);
    if (!found) { throw new ServiceError(404, '未找到可访问的演示订单。'); }
    return { orderId: found.orderId, item: found.item, status: found.status };
  }
  return { login, identity, logout, query };
}
