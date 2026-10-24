import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCards, runDemo, searchProducts, validateProducts } from './src/core';

test('正常流程使用本次目录名称和整数分价格', () => {
  const result = runDemo('success', 1);
  assert.equal(result.ok, true);
  if (result.ok) { assert.equal(result.cards.length, 2); assert.equal(result.cards[0].priceCents, 29900); assert.equal(result.cards[0].name, '轻量通勤双肩包'); }
  assert.equal(result.trace.length, 4);
});
test('模型编造 ID 后整批拒绝，不保留半张正常卡片', () => {
  const result = runDemo('unknown-id', 1);
  assert.equal(result.ok, false);
  if (!result.ok) { assert.match(result.message, /不存在的商品/); }
});
test('工具缺少价格时停止，最终模型夹具尚未调用', () => {
  const result = runDemo('missing-price', 1);
  assert.equal(result.ok, false);
  assert.equal(result.rawFinal, '');
});
test('含 HTML 的 reason 仍是字符串，交给 Vue 文本节点', () => {
  const result = runDemo('injection', 1);
  assert.equal(result.ok, true);
  if (result.ok) { assert.match(result.cards[0].reason, /<img src=x onerror=/); }
});
test('工具失败不会给卡片，显式重试只读操作后成功', () => {
  assert.equal(runDemo('tool-error', 1).ok, false);
  assert.equal(runDemo('tool-error', 2).ok, true);
});
test('无效 JSON 和多余的模型价格字段都被拒绝', () => {
  assert.equal(runDemo('invalid-json', 1).ok, false);
  assert.throws(() => parseCards('{"type":"product_cards","items":[{"productId":"bag-01","reason":"便宜","priceCents":1}]}', [{ id: 'bag-01', name: '真名', priceCents: 29900 }]), /不允许的字段/);
});
test('工具边界拒绝不合法参数与非法价格', () => {
  assert.throws(() => searchProducts({ query: '别的请求', maxPriceCents: 1 }, 'success', 1), /查询参数/);
  for (const priceCents of [-1, 1.5, '29900', Infinity]) { assert.throws(() => validateProducts([{ id: 'a', name: 'b', priceCents }])); }
});
