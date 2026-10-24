export type Product = Readonly<{ id: string; name: string; priceCents: number }>;
export type Card = Product & Readonly<{ reason: string }>;
export type Scenario = 'success' | 'unknown-id' | 'missing-price' | 'injection' | 'tool-error' | 'invalid-json';
export type RunResult =
  | { ok: true; cards: Card[]; trace: string[]; rawFinal: string }
  | { ok: false; message: string; trace: string[]; rawFinal: string };

const CATALOG: readonly Product[] = [
  { id: 'bag-01', name: '轻量通勤双肩包', priceCents: 29900 },
  { id: 'bag-02', name: '防泼水通勤双肩包', priceCents: 42900 }
];

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function validateProducts(value: unknown): Product[] {
  if (!Array.isArray(value) || value.length > 20) { throw new Error('商品工具返回格式不正确。'); }
  const ids = new Set<string>();
  return value.map((item: unknown) => {
    if (!isRecord(item) || typeof item.id !== 'string' || item.id.length > 64 || !item.id ||
        typeof item.name !== 'string' || !item.name || item.name.length > 80 ||
        typeof item.priceCents !== 'number' || !Number.isSafeInteger(item.priceCents) || item.priceCents < 0 || ids.has(item.id)) {
      throw new Error('商品工具缺少有效 ID、名称或整数分价格，已停止展示。');
    }
    ids.add(item.id);
    return { id: item.id, name: item.name, priceCents: item.priceCents };
  });
}

export function searchProducts(argumentsValue: unknown, scenario: Scenario, attempt: number): unknown {
  if (!isRecord(argumentsValue) || argumentsValue.query !== '通勤双肩包' || argumentsValue.maxPriceCents !== 50000) {
    throw new Error('查询参数不符合演示工具协议。');
  }
  if (scenario === 'tool-error' && attempt === 1) { throw new Error('模拟商品服务暂时不可用，请重试只读查询。'); }
  if (scenario === 'missing-price') { return [{ id: 'bag-01', name: '轻量通勤双肩包' }]; }
  const maxPriceCents = argumentsValue.maxPriceCents;
  return CATALOG.filter(product => product.priceCents <= maxPriceCents);
}

export function parseCards(raw: string, products: readonly Product[]): Card[] {
  if (raw.length > 10000) { throw new Error('模型结果过长。'); }
  const value: unknown = JSON.parse(raw);
  if (!isRecord(value) || value.type !== 'product_cards' || !Array.isArray(value.items) || value.items.length < 1 || value.items.length > 3) {
    throw new Error('模型结果不符合商品卡片协议。');
  }
  const selected = new Set<string>();
  return value.items.map((item: unknown) => {
    if (!isRecord(item) || typeof item.productId !== 'string' || typeof item.reason !== 'string' ||
        !item.reason.trim() || item.reason.length > 180 || selected.has(item.productId) ||
        Object.keys(item).some(key => key !== 'productId' && key !== 'reason')) {
      throw new Error('模型卡片字段无效，或携带了不允许的字段。');
    }
    const product = products.find(candidate => candidate.id === item.productId);
    if (!product) { throw new Error(`模型引用了本次工具结果中不存在的商品：${item.productId}`); }
    selected.add(item.productId);
    return { ...product, reason: item.reason };
  });
}

function mockFinal(products: readonly Product[], scenario: Scenario): string {
  if (scenario === 'invalid-json') { return '{ "type": "product_cards", '; }
  return JSON.stringify({
    type: 'product_cards',
    items: products.map((product, index) => ({
      productId: scenario === 'unknown-id' && index === 0 ? 'made-up-999' : product.id,
      reason: scenario === 'injection' && index === 0
        ? '<img src=x onerror="alert(1)"> 这段文本应原样显示'
        : index === 0 ? '重量轻，适合日常通勤。' : '防泼水面料，适合雨天通勤。'
    }))
  });
}

export function runDemo(scenario: Scenario, attempt: number): RunResult {
  const trace: string[] = [];
  let rawFinal = '';
  try {
    // 固定夹具代替第一次模型响应；字段形态仿照 function_call，并非调用模型 API。
    const call = { type: 'function_call', name: 'search_products', call_id: 'demo-call-1', arguments: '{"query":"通勤双肩包","maxPriceCents":50000}' };
    trace.push(`1. 模拟模型返回 function_call\n${JSON.stringify(call, null, 2)}`);
    if (call.name !== 'search_products') { throw new Error('工具不在允许列表。'); }
    const argumentsValue: unknown = JSON.parse(call.arguments);
    const products = validateProducts(searchProducts(argumentsValue, scenario, attempt));
    trace.push(`2. 执行只读工具 → function_call_output\n${JSON.stringify({ type: 'function_call_output', call_id: call.call_id, output: JSON.stringify(products) }, null, 2)}`);
    rawFinal = mockFinal(products, scenario);
    trace.push(`3. 模拟模型返回最终 JSON\n${rawFinal}`);
    const cards = parseCards(rawFinal, products);
    trace.push('4. 前端从 unknown 校验，按商品 ID 从本次工具结果组装名称和价格。');
    return { ok: true, cards, trace, rawFinal };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '演示出现未知错误。';
    trace.push(`停止：${message}`);
    return { ok: false, message, trace, rawFinal };
  }
}
