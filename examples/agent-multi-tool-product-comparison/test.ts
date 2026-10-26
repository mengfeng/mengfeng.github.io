import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareProducts, parseSpec, parseStock, parseReasons, validateArguments } from './src/core';
test('正常保留三行，规格和库存依原始ID汇合', async () => {
  const r = await compareProducts('success'); assert.deepEqual(r.rows.map(x => x.productId), ['bag-01','bag-02','bag-03']);
  assert.equal(r.plannedCalls, 6); assert.equal(r.executedCalls, 6); assert.equal(r.rows.length, 3);
  const row = r.rows[0]; assert.ok(row.specs.ok && row.stock.ok); if (row.specs.ok && row.stock.ok) { assert.equal(row.specs.value.priceCents, 29900); assert.equal(row.stock.value, 12); }
});
test('单件规格失败仍保留该商品库存及另外两行', async () => {
  const r = await compareProducts('spec-failure'); assert.equal(r.rows.length, 3); assert.equal(r.rows[1].specs.ok, false); assert.equal(r.rows[1].stock.ok, true);
  assert.equal(r.rows[0].specs.ok, true); assert.equal(r.rows[2].specs.ok, true); assert.match(r.summary, /1 项工具结果未知/);
});
test('库存失败保留规格，明确未知而非0', async () => {
  const r = await compareProducts('stock-failure'); assert.equal(r.rows.length, 3); assert.equal(r.rows[2].stock.ok, false); assert.equal(r.rows[2].specs.ok, true); assert.match(r.rows[2].reason, /库存未知/);
});
test('已知0库存是有效结果，不当成缺失', async () => {
  const r = await compareProducts('out-of-stock'); const stock = r.rows[1].stock; assert.equal(stock.ok, true); if (stock.ok) { assert.equal(stock.value, 0); } assert.match(r.rows[1].reason, /缺货/);
});
test('模型未知ID被拦截，原bag03行不替换、不执行错误工具', async () => {
  const r = await compareProducts('unknown-id'); assert.equal(r.rows[2].productId, 'bag-03'); assert.equal(r.rows[2].specs.ok, false); assert.equal(r.rows[2].stock.ok, false); assert.equal(r.executedCalls, 4); assert.match(r.trace.join('\n'), /未执行该工具/);
});
test('HTML只保留字符串，DOM安全另外由浏览器核验', async () => {
  const r = await compareProducts('html-text'); assert.match(r.rows[0].reason, /<img/); assert.equal(r.rows.length, 3);
});
test('输入边界拒绝未知或不匹配ID以及缺字段规格', () => {
  assert.throws(() => validateArguments({ productId: 'ghost' }, 'bag-01')); assert.throws(() => validateArguments({ productId: 'bag-01', extra: 1 }, 'bag-01'));
  assert.throws(() => parseSpec({ name: 'x', weightGrams: 2, capacityLiters: 3 }));
});
test('库存整数边界拒绝缺失、负数、小数和字符串，但允许0', () => {
  for (const quantity of [undefined, -1, 1.5, '0', Infinity]) { assert.throws(() => parseStock({ quantity })); } assert.equal(parseStock({ quantity: 0 }), 0);
});
test('模型说明不能携带价格字段或重复引用ID', () => {
  assert.throws(() => parseReasons([{productId:'bag-01',reason:'x',priceCents:1},{productId:'bag-02',reason:'y'},{productId:'bag-03',reason:'z'}]));
  assert.throws(() => parseReasons([{productId:'bag-01',reason:'x'},{productId:'bag-01',reason:'y'},{productId:'bag-03',reason:'z'}]));
});
