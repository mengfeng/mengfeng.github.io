export type Product = Readonly<{sku: string; name: string; priceCents: number; stock: number; topup: boolean}>;
export const CATALOG: readonly Product[] = Object.freeze([
 Object.freeze({sku: 'notebook', name: '演示笔记本', priceCents: 3200, stock: 10, topup: false}),
 Object.freeze({sku: 'pen', name: '演示签字笔', priceCents: 1200, stock: 10, topup: false}),
 Object.freeze({sku: 'cable', name: '演示短线', priceCents: 2400, stock: 3, topup: true}),
 Object.freeze({sku: 'sticky', name: '演示便签', priceCents: 900, stock: 5, topup: true}),
 Object.freeze({sku: 'clip', name: '演示夹子', priceCents: 600, stock: 5, topup: true}),
 Object.freeze({sku: 'bag', name: '演示收纳袋（缺货）', priceCents: 2000, stock: 0, topup: true}),
]);
export const THRESHOLD_CENTS = 10000;
export type Line = Readonly<{sku: string; quantity: number}>;
export type Cart = Readonly<{version: number; lines: readonly Line[]}>;
export type Suggestion = Readonly<{sourceVersion: number; subtotalCents: number; gapCents: number; kind: 'topup' | 'covered' | 'empty' | 'unavailable'; sku: string; quantity: number; addedCents: number; finalCents: number}>;
export type Mode = 'normal' | 'unknown-sku' | 'tampered-cost' | 'stale-version' | 'multiple-calls';
export type State = Readonly<{cart: Cart; status: 'idle' | 'running' | 'current' | 'stale' | 'error'; requestedVersion: number; suggestion: readonly Suggestion[]; error: string; trace: readonly string[]}>;
export function product(sku: string): Product {
 const found = CATALOG.find(item => item.sku === sku);
 if (!found) {throw new Error('商品不在演示目录中。');}
 return found;
}
function snapshot(version: number, lines: readonly Line[]): Cart {
 return Object.freeze({version, lines: Object.freeze(lines.map(line => Object.freeze({...line})))});
}
export function initialCart(version: number): Cart {return snapshot(version, [{sku: 'notebook', quantity: 2}, {sku: 'pen', quantity: 1}]);}
export function subtotal(cart: Cart): number {
 return cart.lines.reduce((sum, line) => sum + product(line.sku).priceCents * line.quantity, 0);
}
export function changeQuantity(cart: Cart, sku: string, quantity: number): Cart {
 const item = product(sku);
 if (!Number.isSafeInteger(quantity) || quantity < 0 || quantity > item.stock) {throw new Error('数量必须为库存范围内的整数。');}
 const current = cart.lines.find(line => line.sku === sku)?.quantity ?? 0;
 if (current === quantity) {return cart;}
 const lines = cart.lines.filter(line => line.sku !== sku);
 if (quantity > 0) {lines.push({sku, quantity});}
 return snapshot(cart.version + 1, lines);
}
export function findTopup(cart: Cart): Suggestion {
 const subtotalCents = subtotal(cart);
 const gapCents = Math.max(0, THRESHOLD_CENTS - subtotalCents);
 const base = {sourceVersion: cart.version, subtotalCents, gapCents, sku: '', quantity: 0, addedCents: 0, finalCents: subtotalCents};
 if (cart.lines.length === 0) {return {...base, kind: 'empty'};}
 if (gapCents === 0) {return {...base, kind: 'covered'};}
 const candidates = CATALOG.filter(item => item.topup).map(item => {
  const quantity = Math.ceil(gapCents / item.priceCents);
  const existing = cart.lines.find(line => line.sku === item.sku)?.quantity ?? 0;
  return {sku: item.sku, quantity, addedCents: item.priceCents * quantity, available: item.stock - existing};
 }).filter(item => item.quantity <= item.available);
 candidates.sort((a, b) => a.addedCents - b.addedCents || a.quantity - b.quantity || a.sku.localeCompare(b.sku));
 const best = candidates[0];
 if (!best) {return {...base, kind: 'unavailable'};}
 return {...base, kind: 'topup', sku: best.sku, quantity: best.quantity, addedCents: best.addedCents, finalCents: subtotalCents + best.addedCents};
}
function record(value: unknown): value is Record<string, unknown> {return typeof value === 'object' && value !== null && !Array.isArray(value);}
function exact(value: Record<string, unknown>, keys: readonly string[]): boolean {const found = Object.keys(value);return found.length === keys.length && found.every(key => keys.includes(key));}
export function validateSuggestion(raw: unknown, cart: Cart): Suggestion {
 const expected = findTopup(cart);
 if (!record(raw) || !exact(raw, Object.keys(expected)) || !Object.entries(expected).every(([key, value]) => raw[key] === value)) {throw new Error('建议与当前快照的商品、数量、金额或版本不符，已拒绝结果。');}
 return expected;
}
export function mockedPlan(cart: Cart, mode: Mode): unknown {
 const call = {name: 'findTopup', arguments: {cartVersion: cart.version}};
 return {calls: mode === 'multiple-calls' ? [call, call] : [call]};
}
export function runGateway(plan: unknown, cart: Cart, mode: Mode, log: (message: string) => void): Suggestion {
 if (!record(plan) || !exact(plan, ['calls']) || !Array.isArray(plan.calls) || plan.calls.length !== 1) {throw new Error('本轮只允许一次只读工具查询。');}
 const call: unknown = plan.calls[0];
 if (!record(call) || !exact(call, ['name', 'arguments']) || call.name !== 'findTopup' || !record(call.arguments) || !exact(call.arguments, ['cartVersion']) || call.arguments.cartVersion !== cart.version) {throw new Error('工具名或购物车版本无效。');}
 log(`findTopup 读取快照 v${cart.version}（只读）`);
 const result = findTopup(cart);
 const raw: unknown = mode === 'unknown-sku' ? {...result, sku: 'forged'} : mode === 'tampered-cost' ? {...result, addedCents: result.addedCents + 1} : mode === 'stale-version' ? {...result, sourceVersion: cart.version - 1} : result;
 return validateSuggestion(raw, cart);
}
export type Model = (cart: Cart, mode: Mode) => Promise<unknown>;
export function createController(publish: (state: State) => void, model: Model): {
 setQuantity: (sku: string, quantity: number) => void; reset: () => void; empty: () => void; invalidate: () => void; generate: (mode: Mode) => Promise<void>; dispose: () => void;
} {
 let cart = initialCart(1);
 let generation = 0;
 let state: State = {cart, status: 'idle', requestedVersion: 0, suggestion: [], error: '', trace: []};
 function emit(next: State): void {state = next;publish(next);}
 function update(next: Cart): void {
  if (next === cart) {return;}
  generation += 1;
  const previous = cart.version;
  cart = next;
  const isStale = state.status === 'running' || state.status === 'current' || state.status === 'stale';
  emit({cart, status: isStale ? 'stale' : 'idle', requestedVersion: state.requestedVersion, suggestion: [], error: '', trace: [`购物车 v${previous} → v${cart.version}`, isStale ? '旧任务/建议已过期，请基于新版本重新查询。' : '等待只读查询。']});
 }
 emit(state);
 return {
  setQuantity(sku, quantity) {update(changeQuantity(cart, sku, quantity));},
  reset() {update(initialCart(cart.version + 1));},
  empty() {update(snapshot(cart.version + 1, []));},
  invalidate() {generation += 1;emit({cart, status: 'idle', requestedVersion: 0, suggestion: [], error: '', trace: []});},
  async generate(mode) {
   generation += 1;
   const request = generation;
   const source = snapshot(cart.version, cart.lines);
   const trace = [`请求 #${request} 绑定购物车 v${source.version}`, '固定模拟模型准备工具计划，无真实模型调用。'];
   emit({cart, status: 'running', requestedVersion: source.version, suggestion: [], error: '', trace});
   try {
    const plan = await model(source, mode);
    if (request !== generation || source.version !== cart.version) {return;}
    const suggestion = runGateway(plan, source, mode, message => trace.push(message));
    if (request !== generation || source.version !== cart.version) {return;}
    emit({cart, status: 'current', requestedVersion: source.version, suggestion: [suggestion], error: '', trace: [...trace, '执行层重算并校验商品、数量、分币金额和版本；只展示当前建议。']});
   } catch (error) {
    if (request === generation && source.version === cart.version) {emit({cart, status: 'error', requestedVersion: source.version, suggestion: [], error: error instanceof Error ? error.message : '查询失败，请重新查询。', trace: [...trace, '本轮无有效建议；无购物车写入或下单操作。']});}
   }
  },
  dispose() {generation += 1;},
 };
}
