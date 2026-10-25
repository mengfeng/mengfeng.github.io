import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startSession, selectOrder, selectIssue, runSession, readPolicy, type Scenario } from './src/core';
function complete() { return selectIssue(selectOrder(startSession(), 'demo-1001'), 'damaged'); }
test('多个订单必须追问，不能自动选择第一项', () => {
  const s = runSession(startSession(), 'ambiguous', 1);
  assert.equal(s.stage, 'choose_order'); assert.equal(s.orderId, ''); assert.equal(s.toolCalls, 0); assert.equal(s.entry, '');
});
test('用户只选订单后继续追问问题类型，不调用政策', () => {
  const s = runSession(selectOrder(startSession(), 'demo-1001'), 'ambiguous', 1);
  assert.equal(s.stage, 'choose_issue'); assert.equal(s.issue, ''); assert.equal(s.toolCalls, 0);
});
test('槽位明确才查询政策，入口是本地固定名称', () => {
  const s = runSession(complete(), 'ambiguous', 1);
  assert.equal(s.stage, 'ready'); assert.equal(s.toolCalls, 1); assert.match(s.entry, /本地演示/); assert.match(s.policyText, /不承诺/);
});
test('切换订单清除旧问题、政策和入口，旧状态不变', () => {
  const old = runSession(complete(), 'ambiguous', 1); const next = selectOrder(old, 'demo-1002');
  assert.equal(next.issue, ''); assert.equal(next.entry, ''); assert.equal(next.policyText, ''); assert.equal(next.stage, 'choose_issue'); assert.notEqual(old.entry, '');
});
test('未知订单和未知问题被拒绝，不能产生政策调用', () => {
  for (const [scenario, initial] of [['unknown-order', startSession()], ['unknown-issue', selectOrder(startSession(), 'demo-1001')]] as const) {
    const s = runSession(initial, scenario, 1); assert.equal(s.stage, 'error'); assert.equal(s.toolCalls, 0); assert.equal(s.entry, '');
  }
  assert.equal(selectOrder(startSession(), 'ghost').orderId, '');
  assert.equal(selectIssue(selectOrder(startSession(), 'demo-1001'), 'ghost').issue, '');
});
test('模型提前 ready 不能替用户填槽位', () => {
  const s = runSession(startSession(), 'premature-ready', 1);
  assert.equal(s.stage, 'choose_order'); assert.equal(s.orderId, ''); assert.equal(s.issue, ''); assert.equal(s.toolCalls, 0);
});
test('政策服务失败后保留选择，显式只读重试恢复', () => {
  const fail = runSession(complete(), 'tool-error', 1);
  assert.equal(fail.stage, 'error'); assert.equal(fail.entry, ''); assert.equal(fail.orderId, 'demo-1001');
  const retry = runSession(fail, 'tool-error', 2); assert.equal(retry.stage, 'ready'); assert.equal(retry.toolCalls, 2);
});
test('HTML 追问保持字符串；工具独立拒绝非法参数', () => {
  const s = runSession(startSession(), 'html-text', 1); assert.match(s.message, /<img/); assert.equal(s.toolCalls, 0);
  assert.throws(() => readPolicy('other', 'damaged', 'ambiguous', 1)); assert.throws(() => readPolicy('demo-1001', 'other', 'ambiguous', 1));
});
