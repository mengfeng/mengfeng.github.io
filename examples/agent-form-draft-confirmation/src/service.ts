export type Address = Readonly<{ recipient: string; phone: string; detail: string }>;
export type Draft = Readonly<{ version: number; fields: Address }>;
export type Preview = Readonly<{ version: number; token: string; before: Address; after: Address }>;
export type Snapshot = Readonly<{ draft: Draft; saved: Address; saveCount: number }>;
export const initialAddress: Address = { recipient: '演示收件人', phone: 'DEMO-0001', detail: '演示市示例路 1 号前台' };
export function record(raw: unknown): Record<string, unknown> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) { throw new Error('请求必须是对象。'); }
  return raw as Record<string, unknown>;
}
export function address(raw: unknown): Address {
  const x = record(raw);
  if (typeof x.recipient !== 'string' || !/^演示[^\r\n]{1,16}$/.test(x.recipient) || typeof x.phone !== 'string' || !/^DEMO-\d{4}$/.test(x.phone) || typeof x.detail !== 'string' || !/^演示[^\r\n]{3,80}$/.test(x.detail)) {
    throw new Error('仅接受演示收件人、DEMO-四位数字及演示地址；请补全字段。');
  }
  return { recipient: x.recipient, phone: x.phone, detail: x.detail };
}
export function version(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isSafeInteger(raw) || raw < 0 || raw > 1000000) { throw new Error('草稿版本不合法。'); }
  return raw;
}
const clone = (x: Address): Address => ({ ...x });
export function createMemoryService(makeToken: () => string) {
  let draft: Draft = { version: 0, fields: clone(initialAddress) };
  let saved = clone(initialAddress);
  let saveCount = 0;
  let pending: Preview | undefined;
  function state(): Snapshot { return { draft: { version: draft.version, fields: clone(draft.fields) }, saved: clone(saved), saveCount }; }
  function writeDraft(raw: unknown): Draft {
    const x = record(raw); const base = version(x.baseVersion); const fields = address(x.fields);
    if (base !== draft.version) { throw new Error('草稿版本已变化，请重新预览。'); }
    if (draft.version >= 1000000) { throw new Error('演示版本上限已到，请重启服务。'); }
    draft = { version: draft.version + 1, fields }; pending = undefined;
    return { version: draft.version, fields: clone(fields) };
  }
  function preview(raw: unknown): Preview {
    const expected = version(record(raw).version);
    if (expected !== draft.version) { throw new Error('草稿版本已变化，请重新预览。'); }
    pending = { version: draft.version, token: makeToken(), before: clone(saved), after: clone(draft.fields) };
    return { ...pending, before: clone(pending.before), after: clone(pending.after) };
  }
  function invalidate(raw: unknown): Snapshot {
    if (version(record(raw).version) !== draft.version) { throw new Error('草稿版本已变化，请重新加载演示。'); }
    pending = undefined;
    return state();
  }
  function confirm(raw: unknown): Snapshot {
    const x = record(raw); const expected = version(x.version);
    if (typeof x.token !== 'string' || !pending || expected !== draft.version || expected !== pending.version || x.token !== pending.token) { throw new Error('确认已失效或已使用，请重新预览。'); }
    const accepted = pending; pending = undefined; // Consume before the simulated save, including failure.
    if (x.failSave === true) { throw new Error('模拟保存失败，未修改保存地址；请重新预览。'); }
    saved = clone(accepted.after); saveCount += 1;
    return state();
  }
  return { state, writeDraft, preview, invalidate, confirm };
}
export type MemoryService = ReturnType<typeof createMemoryService>;
