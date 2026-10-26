export type Scenario = 'success' | 'spec-failure' | 'stock-failure' | 'out-of-stock' | 'unknown-id' | 'html-text';
export type Spec = Readonly<{ name: string; priceCents: number; weightGrams: number; capacityLiters: number }>;
export type Field<T> = { ok: true; value: T } | { ok: false; error: string };
export type Row = Readonly<{ productId: string; label: string; specs: Field<Spec>; stock: Field<number>; reason: string }>;
export type Comparison = Readonly<{ rows: readonly Row[]; summary: string; trace: readonly string[]; plannedCalls: number; executedCalls: number }>;
export type ToolName = 'get_product_specs' | 'get_stock';
type Job = Readonly<{ requestedId: string; name: ToolName; arguments: unknown }>;
export const PRODUCTS = [
  { id: 'bag-01', label: '轻量通勤包' }, { id: 'bag-02', label: '大容量通勤包' }, { id: 'bag-03', label: '紧凑通勤包' }
] as const;
const SPECS: Readonly<Record<string, Spec>> = {
  'bag-01': { name: '轻量通勤包', priceCents: 29900, weightGrams: 520, capacityLiters: 18 },
  'bag-02': { name: '大容量通勤包', priceCents: 42900, weightGrams: 780, capacityLiters: 24 },
  'bag-03': { name: '紧凑通勤包', priceCents: 25900, weightGrams: 450, capacityLiters: 15 }
};
const STOCK: Readonly<Record<string, number>> = { 'bag-01': 12, 'bag-02': 5, 'bag-03': 8 };
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export function validateArguments(value: unknown, requestedId: string): string {
  if (!isRecord(value) || Object.keys(value).length !== 1 || typeof value.productId !== 'string' || value.productId !== requestedId) {
    throw new Error('模型工具参数与本行请求 ID 不匹配，应用已拦截；未执行该工具。');
  }
  if (!PRODUCTS.some(product => product.id === value.productId)) { throw new Error('商品 ID 不在本次允许列表。'); }
  return value.productId;
}
export function parseSpec(value: unknown): Spec {
  if (!isRecord(value) || typeof value.name !== 'string' || !value.name || value.name.length > 80 ||
      typeof value.priceCents !== 'number' || !Number.isSafeInteger(value.priceCents) || value.priceCents < 0 ||
      typeof value.weightGrams !== 'number' || !Number.isSafeInteger(value.weightGrams) || value.weightGrams <= 0 ||
      typeof value.capacityLiters !== 'number' || !Number.isFinite(value.capacityLiters) || value.capacityLiters <= 0) {
    throw new Error('规格字段缺失或格式无效。');
  }
  return { name: value.name, priceCents: value.priceCents, weightGrams: value.weightGrams, capacityLiters: value.capacityLiters };
}
export function parseStock(value: unknown): number {
  if (!isRecord(value) || typeof value.quantity !== 'number' || !Number.isSafeInteger(value.quantity) || value.quantity < 0) {
    throw new Error('库存字段缺失或格式无效。');
  }
  return value.quantity;
}
export async function getProductSpecs(id: string, scenario: Scenario): Promise<unknown> {
  if (!PRODUCTS.some(product => product.id === id)) { throw new Error('规格工具拒绝未知商品。'); }
  await new Promise<void>(resolve => setTimeout(resolve, 60));
  if (scenario === 'spec-failure' && id === 'bag-02') { throw new Error('模拟规格服务失败，容量、重量和价格未知。'); }
  return SPECS[id];
}
export async function getStock(id: string, scenario: Scenario): Promise<unknown> {
  if (!PRODUCTS.some(product => product.id === id)) { throw new Error('库存工具拒绝未知商品。'); }
  await new Promise<void>(resolve => setTimeout(resolve, 20));
  if (scenario === 'stock-failure' && id === 'bag-03') { throw new Error('模拟库存服务失败，不能判断是否有货。'); }
  return { quantity: scenario === 'out-of-stock' && id === 'bag-02' ? 0 : STOCK[id] };
}
function rejection(result: PromiseSettledResult<unknown>): string {
  return result.status === 'rejected' && result.reason instanceof Error ? result.reason.message : '工具返回异常。';
}
function specField(result: PromiseSettledResult<unknown>): Field<Spec> {
  if (result.status === 'rejected') { return { ok: false, error: rejection(result) }; }
  try { return { ok: true, value: parseSpec(result.value) }; }
  catch (error: unknown) { return { ok: false, error: error instanceof Error ? error.message : '规格异常。' }; }
}
function stockField(result: PromiseSettledResult<unknown>): Field<number> {
  if (result.status === 'rejected') { return { ok: false, error: rejection(result) }; }
  try { return { ok: true, value: parseStock(result.value) }; }
  catch (error: unknown) { return { ok: false, error: error instanceof Error ? error.message : '库存异常。' }; }
}
// 固定模型决策：每件商品恰好两类只读工具，最多六个任务，不调用真实模型。
function mockPlan(scenario: Scenario): readonly Job[] {
  return PRODUCTS.flatMap(product => (['get_product_specs', 'get_stock'] as const).map(name => ({
    requestedId: product.id, name,
    arguments: { productId: scenario === 'unknown-id' && product.id === 'bag-03' ? 'ghost-999' : product.id }
  })));
}
export function parseReasons(value: unknown): Readonly<Record<string, string>> {
  if (!Array.isArray(value) || value.length !== PRODUCTS.length) { throw new Error('模型说明必须对应全部请求商品。'); }
  const reasons: Record<string, string> = {};
  for (const item of value as unknown[]) {
    if (!isRecord(item) || Object.keys(item).some(key => key !== 'productId' && key !== 'reason') ||
        typeof item.productId !== 'string' || !PRODUCTS.some(product => product.id === item.productId) ||
        Object.hasOwn(reasons, item.productId) || typeof item.reason !== 'string' || !item.reason.trim() || item.reason.length > 180) {
      throw new Error('模型说明字段或商品 ID 无效，禁止携带价格、规格或库存字段。');
    }
    reasons[item.productId] = item.reason;
  }
  return reasons;
}
function mockReasons(rows: readonly Omit<Row, 'reason'>[], scenario: Scenario): unknown {
  return rows.map((row, index) => ({ productId: row.productId,
    reason: scenario === 'html-text' && index === 0 ? '<img src=x onerror="alert(1)"> 此处应按普通文本显示'
      : !row.specs.ok ? '规格未知，暂时不能比较容量、重量和价格。'
      : !row.stock.ok ? `已知容量 ${row.specs.value.capacityLiters} L；库存未知。`
      : row.stock.value === 0 ? '库存工具返回 0 件，当前显示缺货。'
      : `已知容量 ${row.specs.value.capacityLiters} L、重量 ${row.specs.value.weightGrams} g；演示库存 ${row.stock.value} 件。`
  }));
}
export async function compareProducts(scenario: Scenario): Promise<Comparison> {
  const jobs = mockPlan(scenario);
  if (jobs.length > 6) { throw new Error('工具调用数量超出本例上限。'); }
  const trace: string[] = ['固定模拟模型提出工具计划：3 件商品 × 2 类工具，共 6 个任务。'];
  let executedCalls = 0;
  const results = await Promise.allSettled(jobs.map(async job => {
    const id = validateArguments(job.arguments, job.requestedId);
    executedCalls += 1;
    return job.name === 'get_product_specs' ? getProductSpecs(id, scenario) : getStock(id, scenario);
  }));
  const rows = PRODUCTS.map((product, index) => {
    const specs = specField(results[index * 2]); const stock = stockField(results[index * 2 + 1]);
    trace.push(`${product.id} / get_product_specs：${specs.ok ? '成功' : specs.error}`);
    trace.push(`${product.id} / get_stock：${stock.ok ? '成功' : stock.error}`);
    return { productId: product.id, label: product.label, specs, stock };
  });
  const reasons = parseReasons(mockReasons(rows, scenario));
  const missing = rows.reduce((count, row) => count + Number(!row.specs.ok) + Number(!row.stock.ok), 0);
  trace.push('汇总后生成固定模拟说明；事实字段由工具结果组装，不读取模型的价格或库存。');
  return { rows: rows.map(row => ({ ...row, reason: reasons[row.productId] })),
    summary: `保留 ${rows.length} 件请求商品；${missing === 0 ? '规格与库存均已取得。' : `${missing} 项工具结果未知，不能给出完整比较结论。`}`,
    trace, plannedCalls: jobs.length, executedCalls };
}
