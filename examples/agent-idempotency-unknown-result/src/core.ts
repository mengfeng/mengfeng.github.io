import { applicationValue, fingerprint, operationValue, payloadValue, type Application, type Created, type Lookup, type Operation, type Payload } from './service';
export type Api = { create: (operation: Operation, slow: boolean) => Promise<Created>; lookup: (key: string, fail: boolean) => Promise<Lookup> };
export type OperationStorage = { read: () => Operation | undefined; write: (operation: Operation) => void };
export type UiState = Readonly<{ status: 'idle' | 'sending' | 'unknown' | 'checking' | 'succeeded' | 'blocked'; busy: boolean; operation?: Operation; application?: Application; totalRecords: number; message: string }>;
export const initialUi: UiState = { status: 'idle', busy: false, totalRecords: 0, message: '先核对固定演示申请，再明确提交。' };
export function browserStorage(namespace: string): OperationStorage {
  return {
    read: () => { const raw = localStorage.getItem(namespace); if (raw === null) { return undefined; } if (raw.length > 1024) { throw new Error('本地操作记录过大，请保留记录并人工核对。'); } return operationValue(JSON.parse(raw)); },
    write: operation => { const raw = JSON.stringify(operationValue(operation)); localStorage.setItem(namespace, raw); if (localStorage.getItem(namespace) !== raw) { throw new Error('未能可靠保存操作键，禁止发送申请。'); } },
  };
}
export function createWorkflow(api: Api, storage: OperationStorage, makeKey: () => string, publish: (state: UiState) => void) {
  let state = initialUi; let generation = 0; let disposed = false;
  function emit(next: UiState): void { if (!disposed) { state = next; publish(next); } }
  function init(): void {
    if (disposed) { return; }
    try { const operation = storage.read(); if (operation) { emit({ ...initialUi, status: 'unknown', operation, message: '已恢复原操作键与内容；尚未查询结果，不会自动提交。' }); } }
    catch { emit({ ...initialUi, status: 'blocked', message: '本地记录不可读取或校验失败，已阻止发送；请保留证据后核对。' }); }
  }
  function matches(application: Application, operation: Operation): boolean { return application.key === operation.key && fingerprint(application.payload) === fingerprint(operation.payload); }
  async function send(operation: Operation, slow: boolean): Promise<void> {
    const id = ++generation;
    emit({ ...state, operation, application: undefined, status: 'sending', busy: true, message: '已保存原操作键，正在发送演示申请…' });
    try {
      const result = await api.create(operation, slow); if (id !== generation || disposed) { return; }
      const application = applicationValue(result.application); if (!matches(application, operation)) { throw new Error('响应与原操作不一致。'); }
      emit({ ...state, operation, application, totalRecords: result.totalRecords, status: 'succeeded', busy: false, message: '已核对当前操作对应的演示申请；没有真实售后写入。' });
    } catch { if (id === generation && !disposed) { emit({ ...state, operation, application: undefined, status: 'unknown', busy: false, message: '尚未拿到可靠结果：保存超时或响应异常不等于未创建。保留原键，先查询结果。' }); } }
  }
  async function submit(raw: Payload, slow: boolean): Promise<void> {
    if (disposed || state.busy || state.operation || state.status !== 'idle') { return; }
    try {
      const payload = payloadValue(raw); const operation = operationValue({ key: makeKey(), payload });
      storage.write(operation); await send(operation, slow);
    } catch { if (!disposed) { emit({ ...state, status: 'blocked', busy: false, message: '输入或本地操作键保存失败，申请未发送；请先处理本地记录。' }); } }
  }
  async function check(fail: boolean): Promise<void> {
    if (disposed || state.busy || !state.operation || state.status !== 'unknown') { return; }
    const operation = state.operation; const id = ++generation;
    emit({ ...state, status: 'checking', busy: true, message: '只查询原操作键，不创建新申请…' });
    try {
      const result = await api.lookup(operation.key, fail); if (id !== generation || disposed) { return; }
      if (!result.found || !result.application) { emit({ ...state, status: 'unknown', busy: false, application: undefined, totalRecords: result.totalRecords, message: '暂未查到记录，仍保留结果未知与原键；不能据此新建另一操作。' }); return; }
      const application = applicationValue(result.application); if (!matches(application, operation)) { throw new Error('查询结果与原操作不一致。'); }
      emit({ ...state, application, totalRecords: result.totalRecords, status: 'succeeded', busy: false, message: '查询已确认原操作创建成功，无需再次提交。' });
    } catch { if (id === generation && !disposed) { emit({ ...state, application: undefined, status: 'unknown', busy: false, message: '查询也失败了，结果仍未知；原操作键和内容继续保留。' }); } }
  }
  async function retry(): Promise<void> { if (!disposed && !state.busy && state.operation && state.status === 'unknown') { await send(state.operation, false); } }
  return { init, submit, check, retry, getState: () => state, dispose: () => { disposed = true; ++generation; } };
}
