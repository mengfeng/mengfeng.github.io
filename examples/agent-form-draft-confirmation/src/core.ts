import { address, initialAddress, record, version, type Address, type Draft, type Preview, type Snapshot } from './service';
export type Api = { invalidate: (input: { version: number }) => Promise<Snapshot>; state: () => Promise<Snapshot>; writeDraft: (input: { baseVersion: number; fields: Address }) => Promise<Draft>; preview: (input: { version: number }) => Promise<Preview>; confirm: (input: { version: number; token: string; failSave: boolean }) => Promise<Snapshot> };
export type UiState = Readonly<{ fields: Address; saved: Address; preview: Preview | undefined; status: 'editing' | 'working' | 'ready' | 'saved' | 'error'; busy: boolean; message: string; revision: number; saveCount: number }>;
export const initialUi: UiState = { fields: { ...initialAddress }, saved: { ...initialAddress }, preview: undefined, status: 'editing', busy: false, message: '生成或编辑草稿后，先预览差异，再明确确认。', revision: 0, saveCount: 0 };
export function mockExtract(text: string): Address {
  if (text.length > 100) { throw new Error('演示输入最多 100 字。'); }
  if (text.includes('驿站')) { return { ...initialAddress, detail: '演示市示例路 1 号驿站' }; }
  if (text.includes('前台')) { return { ...initialAddress }; }
  throw new Error('固定模拟只识别“前台”或“驿站”，请手动补全草稿。');
}
export function createWorkflow(api: Api, publish: (state: UiState) => void) {
  let state = initialUi; let operation = 0; let disposed = false;
  function emit(next: UiState): void { if (!disposed) { state = next; publish(next); } }
  function edit(fields: Address): void { if (disposed) { return; } ++operation; emit({ ...state, fields: { ...fields }, revision: state.revision + 1, preview: undefined, busy: false, status: 'editing', message: '草稿已修改，旧预览已失效；请重新预览。' }); }
  async function beginEdit(): Promise<boolean> {
    if (disposed || state.busy) { return false; }
    if (!state.preview) { return true; }
    const id = ++operation; const selected = state.preview;
    emit({ ...state, busy: true, status: 'working', message: '先撤销服务端确认资格…' });
    try {
      await api.invalidate({ version: selected.version });
      if (id !== operation || disposed) { return false; }
      edit(state.fields); return true;
    } catch (error: unknown) {
      if (id === operation && !disposed) { emit({ ...state, busy: false, status: 'error', message: error instanceof Error ? error.message : '撤销失败，表单仍锁定。' }); }
      return false;
    }
  }
  async function init(): Promise<void> {
    const id = operation;
    try { const snapshot = await api.state(); if (id === operation && !disposed) { emit({ ...state, saved: snapshot.saved, saveCount: snapshot.saveCount }); } }
    catch (error: unknown) { if (id === operation && !disposed) { emit({ ...state, status: 'error', message: error instanceof Error ? error.message : '读取演示状态失败。' }); } }
  }
  async function prepare(): Promise<void> {
    if (disposed) { return; }
    const id = ++operation; const fields = { ...state.fields };
    emit({ ...state, preview: undefined, busy: true, status: 'working', message: '同步演示草稿并生成版本预览…' });
    try {
      address(fields);
      const snapshot = await api.state(); if (id !== operation || disposed) { return; }
      const draft = await api.writeDraft({ baseVersion: snapshot.draft.version, fields }); if (id !== operation || disposed) { return; }
      const preview = await api.preview({ version: draft.version }); if (id !== operation || disposed) { return; }
      emit({ ...state, saved: snapshot.saved, saveCount: snapshot.saveCount, preview, status: 'ready', busy: false, message: '请核对旧值与新值；确认只对应当前预览版本。' });
    } catch (error: unknown) { if (id === operation && !disposed) { emit({ ...state, preview: undefined, busy: false, status: 'error', message: error instanceof Error ? error.message : '演示预览失败。' }); } }
  }
  async function confirm(failSave: boolean): Promise<void> {
    if (disposed || state.busy || !state.preview) { return; }
    const selected = state.preview; const id = ++operation;
    emit({ ...state, preview: undefined, busy: true, status: 'working', message: '正在保存当前已确认的演示快照…' });
    try {
      const snapshot = await api.confirm({ version: selected.version, token: selected.token, failSave });
      if (id !== operation || disposed) { return; }
      emit({ ...state, saved: snapshot.saved, saveCount: snapshot.saveCount, preview: undefined, busy: false, status: 'saved', message: '演示内存地址已保存；没有真实地址写入。' });
    } catch (error: unknown) { if (id === operation && !disposed) { emit({ ...state, preview: undefined, busy: false, status: 'error', message: error instanceof Error ? error.message : '演示保存失败，请重新预览。' }); } }
  }
  return { edit, beginEdit, init, prepare, confirm, getState: () => state, dispose: () => { disposed = true; ++operation; } };
}
// Validate all HTTP responses, rather than treating a TypeScript annotation as runtime validation.
export function parseDraft(raw: unknown): Draft { const x = record(raw); return { version: version(x.version), fields: address(x.fields) }; }
export function parseSnapshot(raw: unknown): Snapshot { const x = record(raw); return { draft: parseDraft(x.draft), saved: address(x.saved), saveCount: version(x.saveCount) }; }
export function parsePreview(raw: unknown): Preview { const x = record(raw); if (typeof x.token !== 'string' || x.token.length < 1 || x.token.length > 100) { throw new Error('预览令牌不合法。'); } return { version: version(x.version), token: x.token, before: address(x.before), after: address(x.after) }; }
