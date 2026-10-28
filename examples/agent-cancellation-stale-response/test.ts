import assert from 'node:assert/strict';
import { createSearchController, mockSearchTool, parseProducts, type SearchState, type SearchTool } from './src/core';
const product = (name: string) => [{ id: 'demo-ok', name, priceFen: 100 }];
function fixture() {
  const pending: { signal: AbortSignal; resolve: (value: unknown) => void; reject: (reason: Error) => void }[] = [];
  const states: SearchState[] = [];
  const tool: SearchTool = (_query, signal) => new Promise((resolve, reject) => { pending.push({ signal, resolve, reject }); });
  const controller = createSearchController(tool, state => { states.push(state); });
  return { controller, pending, states };
}
const tests: [string, () => Promise<void> | void][] = [
  ['current success and empty result', async () => {
    const { controller, pending } = fixture();
    const first = controller.start('通勤'); pending[0].resolve(product('当前')); await first;
    assert.equal(controller.getState().status, 'success'); assert.equal(controller.getState().busy, false); assert.equal(controller.getState().products[0].name, '当前');
    const second = controller.start('无匹配'); pending[1].resolve([]); await second;
    assert.deepEqual(controller.getState().products, []); assert.equal(controller.getState().status, 'success');
  }],
  ['old late success cannot overwrite newer success', async () => {
    const { controller, pending, states } = fixture();
    const old = controller.start('旧'); const current = controller.start('新');
    assert.equal(pending[0].signal.aborted, true);
    pending[1].resolve(product('新')); await current; const count = states.length;
    pending[0].resolve(product('旧')); await old;
    assert.equal(controller.getState().products[0].name, '新'); assert.equal(states.length, count);
  }],
  ['old error cannot replace newer result', async () => {
    const { controller, pending, states } = fixture();
    const old = controller.start('旧'); const current = controller.start('新');
    pending[1].resolve(product('新')); await current; const count = states.length;
    pending[0].reject(new Error('旧错误')); await old;
    assert.equal(controller.getState().status, 'success'); assert.equal(states.length, count);
  }],
  ['old finally cannot clear current busy', async () => {
    const { controller, pending } = fixture();
    const old = controller.start('旧'); const current = controller.start('新');
    pending[0].resolve(product('旧')); await old;
    assert.equal(controller.getState().busy, true); assert.equal(controller.getState().query, '新');
    pending[1].resolve(product('新')); await current; assert.equal(controller.getState().busy, false);
  }],
  ['stop with ignored abort keeps canceled state after late result', async () => {
    const { controller, pending, states } = fixture();
    const task = controller.start('通勤'); controller.stop(); const count = states.length;
    assert.equal(pending[0].signal.aborted, true); assert.equal(controller.getState().status, 'canceled');
    pending[0].resolve(product('迟到')); await task;
    assert.equal(states.length, count); assert.equal(controller.getState().busy, false); assert.deepEqual(controller.getState().products, []);
  }],
  ['stop with ignored abort also absorbs late error', async () => {
    const { controller, pending, states } = fixture();
    const task = controller.start('通勤'); controller.stop(); const count = states.length;
    pending[0].reject(new Error('迟到')); await task;
    assert.equal(states.length, count); assert.equal(controller.getState().status, 'canceled');
  }],
  ['current tool error is visible and not busy', async () => {
    const { controller, pending } = fixture();
    const task = controller.start('通勤'); pending[0].reject(new Error('演示失败')); await task;
    assert.equal(controller.getState().message, '演示失败'); assert.equal(controller.getState().status, 'error'); assert.equal(controller.getState().busy, false);
  }],
  ['invalid result is rejected; no partial cards', async () => {
    const { controller, pending } = fixture();
    const task = controller.start('通勤'); pending[0].resolve([{ id: 'demo-bad', name: '缺价格' }]); await task;
    assert.equal(controller.getState().status, 'error'); assert.deepEqual(controller.getState().products, []);
    for (const raw of [{}, [{ id: 'demo-a', name: 'a', priceFen: -1 }], [...product('a'), ...product('b')], Array(4).fill(product('a')[0])]) { assert.throws(() => parseProducts(raw)); }
  }],
  ['invalid query invalidates old work without another tool call', async () => {
    const { controller, pending } = fixture();
    const task = controller.start('旧'); await controller.start(' ');
    assert.equal(pending.length, 1); assert.equal(pending[0].signal.aborted, true);
    pending[0].resolve(product('旧')); await task; assert.equal(controller.getState().status, 'error');
    await controller.start('长'.repeat(61)); assert.equal(pending.length, 1);
  }],
  ['dispose aborts and prevents all later updates and starts', async () => {
    const { controller, pending, states } = fixture();
    const task = controller.start('旧'); controller.dispose(); const count = states.length;
    pending[0].resolve(product('旧')); await task; await controller.start('新');
    assert.equal(pending[0].signal.aborted, true); assert.equal(states.length, count); assert.equal(pending.length, 1);
  }],
  ['stop then restart accepts only the new task', async () => {
    const { controller, pending } = fixture();
    const old = controller.start('旧'); controller.stop(); const current = controller.start('新');
    pending[0].resolve(product('旧')); await old; assert.equal(controller.getState().busy, true);
    pending[1].resolve(product('新')); await current;
    assert.equal(controller.getState().status, 'success'); assert.equal(controller.getState().products[0].name, '新');
  }],
  ['identical query text still creates distinct task identity', async () => {
    const { controller, pending } = fixture();
    const old = controller.start('通勤'); const firstId = controller.getState().taskId;
    const current = controller.start('通勤'); assert.ok(controller.getState().taskId > firstId);
    pending[1].resolve(product('第二次')); await current;
    pending[0].resolve(product('第一次')); await old; assert.equal(controller.getState().products[0].name, '第二次');
  }],
  ['abort listeners observe invalidated state synchronously', async () => {
    const { controller, pending } = fixture();
    const old = controller.start('旧');
    let oldAbortSawCanceled = false;
    pending[0].signal.addEventListener('abort', () => { oldAbortSawCanceled = controller.getState().status === 'canceled' && !controller.getState().busy; });
    controller.stop(); assert.equal(oldAbortSawCanceled, true);
    pending[0].resolve(product('旧')); await old;
  }],
  ['ordinary mock tool observes abort; ignore fixture really ignores it', async () => {
    const normal = new AbortController(); const task = mockSearchTool('通勤包', normal.signal, 'normal'); normal.abort();
    await assert.rejects(task, { name: 'AbortError' });
    const ignored = new AbortController(); const late = mockSearchTool('运动包', ignored.signal, 'slow-ignore'); ignored.abort();
    const result = parseProducts(await late); assert.equal(result[0].id, 'demo-sports');
  }],
];
for (const [name, test] of tests) { await test(); console.log('PASS ' + name); }
console.log(`${tests.length} core tests passed`);
