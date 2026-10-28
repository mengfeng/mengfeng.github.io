export type Product = Readonly<{ id: string; name: string; priceFen: number }>;
export type SearchState = Readonly<{
  taskId: number; query: string; status: 'idle' | 'running' | 'success' | 'canceled' | 'error';
  busy: boolean; products: readonly Product[]; message: string;
}>;
export type Scenario = 'normal' | 'slow-ignore' | 'late-error' | 'invalid';
export type SearchTool = (query: string, signal: AbortSignal, scenario: Scenario) => Promise<unknown>;
export const initialState: SearchState = { taskId: 0, query: '', status: 'idle', busy: false, products: [], message: '尚未运行。' };

export function parseProducts(raw: unknown): readonly Product[] {
  if (!Array.isArray(raw) || raw.length > 3) { throw new Error('工具结果格式不合法。'); }
  const ids = new Set<string>();
  return raw.map((item: unknown) => {
    if (typeof item !== 'object' || item === null || !('id' in item) || !('name' in item) || !('priceFen' in item)) {
      throw new Error('工具返回了缺少字段的商品。');
    }
    const { id, name, priceFen } = item;
    if (typeof id !== 'string' || !/^demo-[a-z0-9-]{1,30}$/.test(id) || ids.has(id) || typeof name !== 'string' || name.length < 1 || name.length > 80 || typeof priceFen !== 'number' || !Number.isSafeInteger(priceFen) || priceFen < 0 || priceFen > 100000000) {
      throw new Error('商品 ID、名称或价格未通过校验。');
    }
    ids.add(id);
    return { id, name, priceFen };
  });
}

export function createSearchController(tool: SearchTool, onState: (state: SearchState) => void) {
  let generation = 0;
  let disposed = false;
  let state = initialState;
  let active: { id: number; controller: AbortController } | undefined;
  function publish(next: SearchState): void { state = next; onState(next); }
  function isCurrent(id: number, signal: AbortSignal): boolean {
    return !disposed && active?.id === id && generation === id && !signal.aborted;
  }
  async function start(rawQuery: string, scenario: Scenario = 'normal'): Promise<void> {
    if (disposed) { return; }
    const previous = active;
    const id = ++generation;
    const controller = new AbortController();
    active = { id, controller }; // Invalidate before abort: abort listeners run synchronously.
    previous?.controller.abort();
    const query = rawQuery.trim();
    if (!query || query.length > 60) {
      active = undefined;
      publish({ taskId: id, query: '', status: 'error', busy: false, products: [], message: '请输入 1–60 字的搜索条件。' });
      return;
    }
    publish({ taskId: id, query, status: 'running', busy: true, products: [], message: '模拟 Agent 已选择只读商品查询工具，等待返回…' });
    try {
      const raw = await tool(query, controller.signal, scenario);
      if (!isCurrent(id, controller.signal)) { return; }
      const products = parseProducts(raw);
      publish({ taskId: id, query, status: 'success', busy: true, products, message: products.length ? '当前任务结果已展示。' : '当前条件没有匹配的演示商品。' });
    } catch (error: unknown) {
      if (!isCurrent(id, controller.signal)) { return; }
      publish({ taskId: id, query, status: 'error', busy: true, products: [], message: error instanceof Error ? error.message : '演示查询失败，请重试。' });
    } finally {
      if (isCurrent(id, controller.signal)) {
        active = undefined;
        publish({ ...state, busy: false });
      }
    }
  }
  function stop(): void {
    if (disposed || !active) { return; }
    const previous = active;
    ++generation;
    active = undefined;
    publish({ ...state, status: 'canceled', busy: false, products: [], message: '已停止接收本次结果；忽略取消的模拟工具可能仍在运行。' });
    previous.controller.abort();
  }
  function dispose(): void {
    if (disposed) { return; }
    disposed = true;
    ++generation;
    const previous = active;
    active = undefined;
    previous?.controller.abort();
  }
  return { start, stop, dispose, getState: (): SearchState => state };
}

function waitForTool(ms: number, signal: AbortSignal, honorsAbort: boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    if (honorsAbort && signal.aborted) { reject(new DOMException('演示工具已中止。', 'AbortError')); return; }
    function onAbort(): void { clearTimeout(timer); signal.removeEventListener('abort', onAbort); reject(new DOMException('演示工具已中止。', 'AbortError')); }
    const timer = setTimeout(() => { signal.removeEventListener('abort', onAbort); resolve(); }, ms);
    if (honorsAbort) { signal.addEventListener('abort', onAbort, { once: true }); }
  });
}

// Fixed local fixtures. No model API, HTTP request, real catalogue, or business write.
export const mockSearchTool: SearchTool = async (query, signal, scenario) => {
  const ignoresAbort = scenario === 'slow-ignore' || scenario === 'late-error';
  await waitForTool(ignoresAbort ? 950 : 320, signal, !ignoresAbort);
  if (scenario === 'late-error') { throw new Error('旧任务模拟查询失败。'); }
  if (scenario === 'invalid') { return [{ id: 'demo-bad', name: '缺少价格的演示商品' }]; }
  if (query.includes('运动')) { return [{ id: 'demo-sports', name: '演示轻便运动包', priceFen: 12900 }]; }
  if (query.includes('通勤')) { return [{ id: 'demo-commute', name: '演示通勤双肩包', priceFen: 23900 }]; }
  return [];
};
