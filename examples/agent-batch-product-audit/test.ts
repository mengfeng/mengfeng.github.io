import assert from 'node:assert/strict';
import { createBatchController, validatePlan, validateResult, makePlan, makeMockTool, checkProduct, RetryableError, SOURCE_VERSION, type Snapshot, type Tool, type Request } from './src/core';
let passed = 0;
async function test(name: string, body: () => void | Promise<void>): Promise<void> { await body(); passed += 1; console.log(`ok ${passed} - ${name}`); }
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const subset = (...productIds: string[]) => ({ tool: 'check_product', productIds });
const request: Request = { batchId: 1, sourceVersion: SOURCE_VERSION, productId: 'P01', attempt: 1 };
const good: Tool = async req => ({ ...req, issues: checkProduct(req.productId) });
const noop = (_s: Snapshot): void => {};
await test('fixed plan has ten IDs', () => { assert.equal(validatePlan(makePlan()).length, 10); });
for (const [name, plan] of [
  ['unknown tool', { tool: 'delete_product', productIds: ['P01'] }], ['empty', subset()], ['unknown ID', subset('P99')], ['duplicate ID', subset('P01', 'P01')], ['extra field', { ...subset('P01'), account: 'real' }], ['non-string ID', { tool: 'check_product', productIds: [1] }], ['null', null], ['too many IDs', subset(...Array.from({ length: 11 }, () => 'P01'))],
] as const) { await test(`plan rejects ${name}`, () => assert.throws(() => validatePlan(plan))); }
await test('missing business fields are rule issues', () => { assert.deepEqual(checkProduct('P09'), ['image_alt_missing', 'spec_missing']); assert.deepEqual(checkProduct('P01'), []); });
for (const [name, patch] of [
  ['wrong product', { productId: 'P02' }], ['wrong version', { sourceVersion: 'old' }], ['wrong attempt', { attempt: 2 }], ['wrong batch', { batchId: 8 }], ['unknown field', { surprise: true }], ['invented issue', { issues: ['title_missing'] }], ['missing issues', { issues: undefined }],
] as const) { await test(`result rejects ${name}`, () => assert.throws(() => validateResult({ ...request, issues: [], ...patch }, request))); }
await test('result cannot conceal missing data', () => assert.throws(() => validateResult({ ...request, productId: 'P02', issues: [] }, { ...request, productId: 'P02' })));
await test('invalid plan makes zero calls', async () => { const c = createBatchController(good, noop, { timeoutMs: 20 }); assert.equal(await c.start(subset('P99')), false); assert.equal(c.snapshot().calls, 0); });
await test('bounded actual concurrency and per-row progress', async () => {
  let active = 0, peak = 0; const progress: number[] = [];
  const tool: Tool = async req => { active += 1; peak = Math.max(peak, active); await wait(5); active -= 1; return good(req, new AbortController().signal); };
  const c = createBatchController(tool, s => progress.push(s.rows.filter(r => ['pass', 'issues'].includes(r.status)).length), { timeoutMs: 100 });
  await c.start(makePlan()); assert.equal(peak, 3); assert.equal(active, 0); assert.equal(c.snapshot().peak, 3); assert.ok(progress.some(n => n > 0 && n < 10)); assert.equal(c.snapshot().calls, 10);
});
await test('initial transient + timeout retain other results; retry only two', async () => {
  const c = createBatchController(makeMockTool('normal', .05), noop, { timeoutMs: 35 }); await c.start(makePlan());
  let s = c.snapshot(); assert.equal(s.rows.filter(r => r.status === 'retryable').length, 2); assert.equal(s.rows.filter(r => r.status === 'issues').length, 3); assert.equal(s.calls, 10);
  const preserved = s.rows.filter(r => !['P03', 'P07'].includes(r.id)); await c.retryFailed(); s = c.snapshot(); assert.equal(s.calls, 12); assert.deepEqual(s.rows.filter(r => !['P03', 'P07'].includes(r.id)), preserved); assert.equal(s.rows.filter(r => r.status === 'pass').length, 7); assert.equal(await c.retryFailed(), false);
});
await test('all failures reach per-row two and batch twenty ceiling', async () => {
  const c = createBatchController(async () => { throw new RetryableError(); }, noop, { timeoutMs: 100 });
  await c.start(makePlan()); await c.retryFailed(); assert.equal(c.snapshot().calls, 20); assert.ok(c.snapshot().rows.every(r => r.attempts === 2)); assert.equal(await c.retryFailed(), false); assert.equal(c.snapshot().calls, 20);
});
await test('forged result is permanent and excluded from retries', async () => {
  const c = createBatchController(async req => ({ ...req, productId: 'P99', issues: [] }), noop, { timeoutMs: 100 });
  await c.start(subset('P01')); assert.equal(c.snapshot().rows[0].status, 'error'); assert.equal(await c.retryFailed(), false);
});
await test('unknown tool exceptions are not automatically retried', async () => { const c = createBatchController(async () => { throw new Error('unknown'); }, noop, { timeoutMs: 20 }); await c.start(subset('P01')); assert.equal(c.snapshot().rows[0].status, 'error'); assert.equal(await c.retryFailed(), false); });
await test('double start cannot duplicate jobs', async () => { const c = createBatchController(async req => { await wait(10); return good(req, new AbortController().signal); }, noop, { timeoutMs: 100 }); const p = c.start(subset('P01')); assert.equal(await c.start(subset('P01')), false); await p; assert.equal(c.snapshot().calls, 1); assert.equal(await c.start(subset('P01')), false); });
await test('double retry cannot duplicate jobs', async () => { const c = createBatchController(async () => { await wait(8); throw new RetryableError(); }, noop, { timeoutMs: 100 }); await c.start(subset('P01')); const p = c.retryFailed(); assert.equal(await c.retryFailed(), false); await p; assert.equal(c.snapshot().calls, 2); });
await test('timeout abort is observed before slot is reused', async () => {
  let active = 0, peak = 0, stopped = 0;
  const tool: Tool = async (_req, signal) => { active++; peak = Math.max(peak, active); await new Promise<void>((_resolve, reject) => { signal.addEventListener('abort', () => { active--; stopped++; reject(new Error('abort')); }, { once: true }); }); return {}; };
  const c = createBatchController(tool, noop, { timeoutMs: 5 }); await c.start(makePlan()); assert.equal(peak, 3); assert.equal(active, 0); assert.equal(stopped, 10); assert.ok(c.snapshot().rows.every(r => r.status === 'retryable'));
});
await test('non-cooperative tool retains slot until settlement and late success is timeout', async () => {
  let active = 0, peak = 0;
  const tool: Tool = async req => { active++; peak = Math.max(peak, active); await wait(20); active--; return good(req, new AbortController().signal); };
  const c = createBatchController(tool, noop, { timeoutMs: 2 }); await c.start(makePlan()); assert.equal(peak, 3); assert.ok(c.snapshot().rows.every(r => r.status === 'retryable'));
});
await test('reset drains old tools, rejects new batch while draining, ignores late results', async () => {
  const c = createBatchController(async req => { await wait(20); return good(req, new AbortController().signal); }, noop, { timeoutMs: 100 });
  const running = c.start(makePlan()); c.reset(); assert.equal(c.snapshot().state, 'draining'); assert.equal(await c.start(makePlan()), false); await running; assert.equal(c.snapshot().state, 'idle'); assert.equal(c.snapshot().rows.length, 0); assert.equal(c.snapshot().calls, 0);
  await c.start(subset('P01')); assert.equal(c.snapshot().batchId, 2); assert.equal(c.snapshot().rows.length, 1);
});
await test('dispose ignores late output and future actions', async () => { let count = 0; const c = createBatchController(async req => { await wait(10); return good(req, new AbortController().signal); }, () => { count++; }, { timeoutMs: 100 }); const running = c.start(subset('P01')); c.dispose(); const after = count; await running; assert.equal(count, after); assert.equal(await c.start(makePlan()), false); assert.equal(await c.retryFailed(), false); });
await test('snapshot is isolated from external mutations', async () => { const c = createBatchController(good, noop, { timeoutMs: 100 }); await c.start(subset('P01')); c.snapshot().rows[0].status = 'error'; assert.equal(c.snapshot().rows[0].status, 'pass'); });
await test('validated plan owns ID array snapshot', async () => { const c = createBatchController(async req => { await wait(5); return good(req, new AbortController().signal); }, noop, { timeoutMs: 100 }); const p = subset('P01','P02','P03','P04'); const running = c.start(p); p.productIds[3] = 'P99'; await running; assert.equal(c.snapshot().rows[3].id, 'P04'); assert.equal(c.snapshot().rows[3].status, 'pass'); });
await test('sparse plan rejected', () => assert.throws(() => validatePlan({ tool: 'check_product', productIds: new Array(1) })));
await test('sparse issues rejected', () => assert.throws(() => validateResult({ ...request, productId: 'P02', issues: new Array(1) }, { ...request, productId: 'P02' })));
await test('persistent fixture stops P03 after two attempts', async () => { const c = createBatchController(makeMockTool('persistent-failure', .05), noop, { timeoutMs: 35 }); await c.start(makePlan()); await c.retryFailed(); const row = c.snapshot().rows.find(r => r.id === 'P03'); assert.equal(row?.status, 'retryable'); assert.equal(row?.attempts, 2); assert.equal(await c.retryFailed(), false); assert.equal(c.snapshot().calls, 12); });
await test('tool cannot mutate the request used for receipt validation', async () => { const c = createBatchController(async req => { req.productId = 'P02'; return { ...req, issues: checkProduct('P02') }; }, noop, { timeoutMs: 100 }); await c.start(subset('P01')); assert.equal(c.snapshot().rows[0].status, 'error'); assert.deepEqual(c.snapshot().rows[0].issues, []); });
await test('oversized plan rejected before array iteration', () => { const ids = ['P01']; ids.length = 1000000; Object.defineProperty(ids, Symbol.iterator, { value: () => { throw new Error('should not iterate'); } }); assert.throws(() => validatePlan({ tool: 'check_product', productIds: ids }), /1–10/); });
console.log(JSON.stringify({ passed, failed: 0 }));
