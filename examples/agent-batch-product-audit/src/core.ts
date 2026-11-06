export const LIMITS = { products: 10, concurrent: 3, attempts: 2, calls: 20 } as const;
export const SOURCE_VERSION = 'demo-catalog-v1';
export type Product = { id: string; title: string; imageAlt: string; spec: string };
export const PRODUCTS: readonly Product[] = Object.freeze(Array.from({ length: 10 }, (_, i) => Object.freeze({
  id: `P${String(i + 1).padStart(2, '0')}`,
  title: i === 1 ? '' : ['旅行杯', '帆布包', '桌灯', '笔记本', '收纳盒', '水壶', '鼠标垫', '书签', '靠垫', '置物架'][i],
  imageAlt: i === 4 || i === 8 ? '' : '演示商品外观说明',
  spec: i === 8 ? '' : '演示规格：标准款',
})));
const ISSUE_KEYS = ['title_missing', 'image_alt_missing', 'spec_missing'] as const;
export type Issue = typeof ISSUE_KEYS[number];
export const ISSUE_TEXT: Record<Issue, string> = { title_missing: '缺少商品标题', image_alt_missing: '缺少图片说明', spec_missing: '缺少规格' };
export type Request = { batchId: number; sourceVersion: string; productId: string; attempt: number };
export type Tool = (request: Request, signal: AbortSignal) => Promise<unknown>;
export type RowStatus = 'waiting' | 'queued' | 'running' | 'pass' | 'issues' | 'retryable' | 'error';
export type Row = { id: string; status: RowStatus; attempts: number; issues: Issue[]; message: string };
export type Snapshot = { batchId: number; state: 'idle' | 'running' | 'draining' | 'done'; rows: Row[]; calls: number; active: number; peak: number; error: string; trace: string[] };
export class RetryableError extends Error {}
export class InvalidResponseError extends Error {}
function record(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function keys(value: Record<string, unknown>, expected: string[]): boolean { return Object.keys(value).sort().join(',') === [...expected].sort().join(','); }
export function validatePlan(value: unknown): string[] {
  if (!record(value) || !keys(value, ['tool', 'productIds']) || value.tool !== 'check_product' || !Array.isArray(value.productIds)) { throw new Error('计划格式不正确或工具不在允许列表。'); }
  if (value.productIds.length < 1 || value.productIds.length > LIMITS.products) { throw new Error('计划必须包含 1–10 个商品 ID。'); }
  const ids: unknown[] = Array.from(value.productIds);
  if (new Set(ids).size !== ids.length || ids.some(id => typeof id !== 'string' || !PRODUCTS.some(p => p.id === id))) { throw new Error('计划必须包含 1–10 个已知且不重复的商品 ID。'); }
  return [...ids] as string[];
}
export function checkProduct(id: string): Issue[] {
  const product = PRODUCTS.find(p => p.id === id);
  if (!product) { throw new Error('未知演示商品。'); }
  const issues: Issue[] = [];
  if (!product.title.trim()) { issues.push('title_missing'); }
  if (!product.imageAlt.trim()) { issues.push('image_alt_missing'); }
  if (!product.spec.trim()) { issues.push('spec_missing'); }
  return issues;
}
export function validateResult(value: unknown, request: Request): Issue[] {
  if (!record(value) || !keys(value, ['batchId', 'sourceVersion', 'productId', 'attempt', 'issues']) || value.batchId !== request.batchId || value.sourceVersion !== request.sourceVersion || value.productId !== request.productId || value.attempt !== request.attempt || !Array.isArray(value.issues)) { throw new InvalidResponseError('工具回执与本次任务不匹配。'); }
  const expected = checkProduct(request.productId);
  if (value.issues.length !== expected.length || Array.from(value.issues).some((issue, index) => issue !== expected[index])) { throw new InvalidResponseError('工具回执与本地固定规则不一致。'); }
  return [...expected];
}
export function makePlan(): unknown { return { tool: 'check_product', productIds: PRODUCTS.map(p => p.id) }; }
export function makeMockTool(mode: 'normal' | 'forged-result' | 'persistent-failure' = 'normal', scale = 1): Tool {
  return async (request, signal) => {
    const waitMs = request.productId === 'P07' && request.attempt === 1 ? 1500 : 140 + Number(request.productId.slice(1)) * 25;
    await new Promise<void>((resolve, reject) => {
      const aborted = (): void => { clearTimeout(timer); signal.removeEventListener('abort', aborted); reject(new Error('aborted')); };
      const timer = setTimeout(() => { signal.removeEventListener('abort', aborted); resolve(); }, waitMs * scale);
      if (signal.aborted) { aborted(); } else { signal.addEventListener('abort', aborted, { once: true }); }
    });
    if (request.productId === 'P03' && (request.attempt === 1 || mode === 'persistent-failure')) { throw new RetryableError('模拟服务暂时不可用'); }
    return { ...request, productId: mode === 'forged-result' && request.productId === 'P05' ? 'P99' : request.productId, issues: checkProduct(request.productId) };
  };
}
export function createBatchController(tool: Tool, changed: (state: Snapshot) => void, options: { timeoutMs: number }) {
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 1 || options.timeoutMs > 30000) { throw new Error('timeoutMs must be between 1 and 30000'); }
  let state: Snapshot = { batchId: 0, state: 'idle', rows: [], calls: 0, active: 0, peak: 0, error: '', trace: [] };
  let generation = 0;
  let disposed = false;
  let busy = false;
  const controllers = new Set<AbortController>();
  const snapshot = (): Snapshot => structuredClone(state);
  const emit = (): void => { if (!disposed) { changed(snapshot()); } };
  const log = (message: string): void => { state.trace = [...state.trace, message].slice(-60); };
  const find = (id: string): Row => {
    const row = state.rows.find(item => item.id === id);
    if (!row) { throw new Error('Missing task row'); }
    return row;
  };
  const isCurrent = (token: number): boolean => !disposed && generation === token;
  async function execute(id: string, token: number): Promise<void> {
    if (!isCurrent(token) || state.calls >= LIMITS.calls) { return; }
    const row = find(id);
    if (row.attempts >= LIMITS.attempts) { return; }
    row.status = 'running'; row.attempts += 1; row.message = ''; row.issues = [];
    const request = Object.freeze({ batchId: state.batchId, sourceVersion: SOURCE_VERSION, productId: id, attempt: row.attempts });
    const controller = new AbortController(); controllers.add(controller);
    state.calls += 1; state.active += 1; state.peak = Math.max(state.peak, state.active);
    log(`${id} · 第 ${row.attempts} 次调用开始`); emit();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, options.timeoutMs);
    try {
      const result = await tool(request, controller.signal);
      if (!isCurrent(token)) { return; }
      if (timedOut) { row.status = 'retryable'; row.message = '执行超时，未取得可用结果'; }
      else { row.issues = validateResult(result, request); row.status = row.issues.length ? 'issues' : 'pass'; }
    } catch (error: unknown) {
      if (!isCurrent(token)) { return; }
      row.status = timedOut || error instanceof RetryableError ? 'retryable' : 'error';
      row.message = timedOut ? '执行超时，未取得可用结果' : error instanceof InvalidResponseError ? error.message : error instanceof RetryableError ? '模拟服务暂时不可用' : '工具执行异常，请人工核查';
    } finally {
      clearTimeout(timer); controllers.delete(controller); state.active -= 1;
      if (isCurrent(token)) { log(`${id} · ${row.status} · 累计 ${row.attempts} 次`); emit(); }
    }
  }
  async function run(ids: string[]): Promise<void> {
    busy = true; state.state = 'running'; state.error = ''; const token = generation;
    for (const id of ids) { find(id).status = 'queued'; }
    emit(); let cursor = 0;
    async function worker(): Promise<void> {
      for (let step = 0; step < LIMITS.products; step += 1) {
        if (!isCurrent(token) || cursor >= ids.length) { return; }
        const id = ids[cursor++]; await execute(id, token);
      }
    }
    await Promise.all(Array.from({ length: Math.min(LIMITS.concurrent, ids.length) }, () => worker()));
    busy = false;
    if (disposed) { return; }
    if (token !== generation) { state = { ...state, state: 'idle', rows: [], calls: 0, active: 0, peak: 0, error: '', trace: [] }; }
    else { state.state = 'done'; }
    emit();
  }
  async function start(plan: unknown): Promise<boolean> {
    if (disposed || busy || state.state !== 'idle') { return false; }
    let ids: string[];
    try { ids = validatePlan(plan); } catch (error: unknown) { state.error = error instanceof Error ? error.message : '计划无效'; emit(); return false; }
    generation += 1; state.batchId += 1;
    state.rows = ids.map(id => ({ id, status: 'waiting', attempts: 0, issues: [], message: '' }));
    await run(ids); return true;
  }
  async function retryFailed(): Promise<boolean> {
    if (disposed || busy || state.state !== 'done') { return false; }
    const ids = state.rows.filter(row => row.status === 'retryable' && row.attempts < LIMITS.attempts).map(row => row.id);
    if (!ids.length || state.calls + ids.length > LIMITS.calls) { return false; }
    await run(ids); return true;
  }
  function reset(): void {
    if (disposed) { return; }
    generation += 1;
    if (busy) { state.state = 'draining'; for (const controller of controllers) { controller.abort(); } }
    else { state = { ...state, state: 'idle', rows: [], calls: 0, active: 0, peak: 0, error: '', trace: [] }; }
    emit();
  }
  function dispose(): void { if (!disposed) { reset(); disposed = true; } }
  return { snapshot, start, retryFailed, reset, dispose };
}
