export type Payload = Readonly<{ orderId: 'DEMO-ORDER-1001'; reason: '演示包装破损' | '演示配件缺失' }>;
export type Operation = Readonly<{ key: string; payload: Payload }>;
export type Application = Readonly<{ applicationId: string; key: string; payload: Payload }>;
export type Created = Readonly<{ application: Application; totalRecords: number }>;
export type Lookup = Readonly<{ found: boolean; application?: Application; totalRecords: number }>;
export class ServiceError extends Error { constructor(public readonly status: number, message: string) { super(message); } }
export function record(raw: unknown): Record<string, unknown> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) { throw new ServiceError(400, '输入必须是对象。'); }
  return raw as Record<string, unknown>;
}
export function keyValue(raw: unknown): string {
  if (typeof raw !== 'string' || !/^op-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(raw)) { throw new ServiceError(400, '演示操作键不合法。'); }
  return raw;
}
export function payloadValue(raw: unknown): Payload {
  const x = record(raw);
  if (Object.keys(x).length !== 2 || x.orderId !== 'DEMO-ORDER-1001' || (x.reason !== '演示包装破损' && x.reason !== '演示配件缺失')) { throw new ServiceError(400, '只接受固定演示订单与两种演示原因。'); }
  return { orderId: x.orderId, reason: x.reason };
}
export function operationValue(raw: unknown): Operation {
  const x = record(raw); if (Object.keys(x).length !== 2) { throw new ServiceError(400, '操作只接受 key 与 payload。'); }
  return { key: keyValue(x.key), payload: payloadValue(x.payload) };
}
export function fingerprint(payload: Payload): string { return JSON.stringify([payload.orderId, payload.reason]); }
export function applicationValue(raw: unknown): Application {
  const x = record(raw); if (typeof x.applicationId !== 'string' || !/^DEMO-APP-\d{1,3}$/.test(x.applicationId)) { throw new ServiceError(400, '申请响应格式不合法。'); }
  return { applicationId: x.applicationId, key: keyValue(x.key), payload: payloadValue(x.payload) };
}
export function countValue(raw: unknown): number { if (typeof raw !== 'number' || !Number.isSafeInteger(raw) || raw < 0 || raw > 64) { throw new ServiceError(400, '记录数不合法。'); } return raw; }
export function createdValue(raw: unknown): Created { const x = record(raw); return { application: applicationValue(x.application), totalRecords: countValue(x.totalRecords) }; }
export function lookupValue(raw: unknown): Lookup {
  const x = record(raw); if (typeof x.found !== 'boolean') { throw new ServiceError(400, '状态响应不合法。'); }
  return { found: x.found, ...(x.found ? { application: applicationValue(x.application) } : {}), totalRecords: countValue(x.totalRecords) };
}
function copy(application: Application): Application { return { ...application, payload: { ...application.payload } }; }
export function createApplicationService() {
  const records = new Map<string, { fingerprint: string; application: Application }>();
  function create(raw: unknown): Created {
    const operation = operationValue(raw); const stamp = fingerprint(operation.payload); const existing = records.get(operation.key);
    if (existing) {
      if (existing.fingerprint !== stamp) { throw new ServiceError(409, '同一操作键对应的申请内容不一致，拒绝创建。'); }
      return { application: copy(existing.application), totalRecords: records.size };
    }
    if (records.size >= 64) { throw new ServiceError(429, '演示记录达到上限，请保留未知操作后核对服务状态。'); }
    const application: Application = { applicationId: 'DEMO-APP-' + (records.size + 1), key: operation.key, payload: { ...operation.payload } };
    records.set(operation.key, { fingerprint: stamp, application });
    return { application: copy(application), totalRecords: records.size };
  }
  function lookup(raw: unknown): Lookup {
    const x = record(raw); if (Object.keys(x).length !== 1) { throw new ServiceError(400, '查询只接受 key。'); }
    const item = records.get(keyValue(x.key));
    return { found: Boolean(item), ...(item ? { application: copy(item.application) } : {}), totalRecords: records.size };
  }
  return { create, lookup };
}
