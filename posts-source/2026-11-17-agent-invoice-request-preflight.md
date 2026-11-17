## 开票按钮前，先停在一张可核对的草稿上

用户说“帮我给这笔订单开发票”，页面如果只把这句话交给 Agent，容易漏掉三个变化中的事实：订单是否仍有可开金额、开票抬头是否与当前账户资料一致、演示规则是否允许把运费或退款算进去。候选看起来完整，也可能引用了旧订单，或把已经开过的金额再算一次。

这篇用 Vue 3 + TypeScript 做一张**发票申请资料预检页**。它并行读取三份本地只读夹具，展示金额计算和来源，再检查一个固定的模拟 Agent 候选。即使全部通过，页面也只出现待人工确认的草稿：[打开交互示例](/examples/agent-invoice-request-preflight/)可切换十种场景，[下载完整源码](/examples/agent-invoice-request-preflight/source.zip)可复现离线断言。所有订单、企业名称、演示税号和规则都是虚构数据，示例没有真实模型、订单系统、开票、邮件或付款调用。

![手绘机器人把订单和抬头资料汇入待人工确认的发票草稿，并挡住超额金额](/images/agent-invoice-request-preflight/flow.webp)

## 页面把候选和证据分开

左侧是 `order.read`、`profile.read`、`policy.read` 的本轮结果。订单夹具 `ORD-DEMO-72` 的实付是 `¥259.00`，运费 `¥12.00`，已退款 `¥30.00`，已开 `¥50.00`。演示政策规定按“实付减运费、已退款和已开金额”计算，于是本轮剩余为 `¥167.00`。这是**人为设定的教学规则**，并非任何真实平台或地区的开票政策；运费、折扣、税额和票种在真实业务里要由实际规则决定。

抬头夹具只存“演示科技有限公司”和 `DEMO-TAX-ID`。这个字符串不是有效税号，避免把真实企业资料放进公开示例。右侧显示模拟候选的结构化 JSON，以及通过核验后由已读证据拼成的草稿。候选自己报告的来源 ID 只是待核对输入，页面从本轮工具结果另算一份预期来源，不把“我引用了政策”这句话当证据。

这个交互还刻意不让候选自由填写最终抬头名称。候选只给出一个抬头标识，草稿上的名称来自已读取的账户资料。若用户想换抬头，应该先在有权限的资料流程中修改或选择，再重新取得证据；把一句“发给另一家公司”当作已验证抬头，会让页面出现看似合理但无法追溯的字段。演示中的账户资料也没有任何真实身份校验能力，不能直接照搬到业务接口。

三项只读任务互不依赖，示例用 [`Promise.allSettled()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/allSettled)收集各自结果。MDN 明确返回数组保留输入顺序，即使完成顺序不同也不会把抬头与政策结果对调。页面把失败的项单独标出；任何一项没读到，状态是 `blocked`，不是把缺失证据解释成“允许开票”。这里的超时由本地 `Promise.reject()` 固定制造，不代表实测网络行为。

| 只读来源 | 本轮作用 | 缺失或过期时 |
| --- | --- | --- |
| `order.read#72@r3` | 实付、运费、退款、已开金额 | 不计算可提交金额 |
| `profile.read#demo@r2` | 当前账户的演示抬头 | 不采纳候选自填抬头 |
| `policy.read#invoice@r4` | 本文专用演示公式 | 不套用猜测的规则 |

## 金额用“分”计算，再拦住超额候选

`availableCents()` 只接受非负安全整数，计算结果也必须是安全整数。这能避开在业务判断里直接比较 `167.00` 这类浮点金额，仍不等于一套完整的财务金额库。[MDN 的 `Number.isSafeInteger()` 文档](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number/isSafeInteger)说明它用于判断整数是否能安全表示；示例只处理范围很小的人民币分。真实系统还要有统一的金额类型、舍入规则、币种和服务端核算。

```ts
const parts = [order.paidCents, order.shippingCents,
  order.refundedCents, order.issuedCents]
if (parts.some(value => !Number.isSafeInteger(value) || value < 0)) {
  return -1
}
const remaining = order.paidCents - order.shippingCents
  - order.refundedCents - order.issuedCents
return Number.isSafeInteger(remaining) ? remaining : -1
```

候选默认请求 `16700` 分。切换“候选金额超额”，它改为 `18700` 分，页面拒绝草稿。切换“新增退款”，订单读取结果把已退款改为 `13000` 分，剩余额度降至 `6700` 分；即便候选金额仍是昨天看起来合理的 `16700` 分，也会拒绝。这比只验证“候选是个数字”更接近用户真正关心的事：本次申请不能超过**此刻的**可用范围。

金额瀑布要让用户能倒推，而不是只写一个绿色的“可开”。页面同时列出实付、运费、已退款、已开与剩余额度；若任一字段是负数、超过安全整数范围，或相减后得到负数，就不展示可确认金额。`¥167.00` 也不一定等于用户想开的票面金额：示例允许小于等于剩余额度的部分金额，但真实平台可能限制部分开票、要求按商品行拆分，或把折扣分摊到不同税率。那些规则要由正式政策和后端计算，不能靠 Agent 自行补齐。

## 来源、版本和字段都要由校验器核对

模拟候选被当作 `unknown` 输入，先由 `parseCandidate()` 检查订单号、版本、币种、正整数金额和恰好三个来源 ID。只有结构有效，`verify()` 才继续比较本轮订单、抬头、规则和候选。TypeScript 的[判别联合与类型收窄文档](https://www.typescriptlang.org/docs/handbook/2/narrowing.html#discriminated-unions)说明了按 `kind` 区分成功与错误结果的方式；类型检查帮助写对分支，但运行时的候选仍须实际验证。

```ts
if (order.revision !== currentRevision) {
  return assessment('stale', '订单已更新；旧快照不能用于本轮申请。', -1)
}
if (candidate.sourceIds.some((id, index) => id !== expectedSources[index])) {
  return assessment('rejected', '候选引用与本轮工具结果不匹配。', available)
}
if (candidate.orderId !== order.id || candidate.taxId !== profile.taxId || candidate.currency !== order.currency) {
  return assessment('rejected', '订单、抬头或币种与已读取资料不一致。', available)
}
```

“订单版本已变化”让工具返回旧修订号，状态是 `stale`；“候选引用伪造”“候选抬头不符”和“字段类型错误”都得到 `rejected`。页面另有“模拟订单更新”按钮：它增加当前修订号并清空上一轮草稿，迟到的旧任务通过请求序号丢弃。Vue 官方的 [`ref()` 类型说明](https://vuejs.org/guide/typescript/composition-api#typing-ref)适用于这里的 `Collected | null` 与 `Assessment | null`：未读到和未生成是明确状态，不能继续显示上一次的成功结果。

这两种“过期”要分开看。若工具在本轮返回的是旧订单修订号，应该重读订单；若页面在等待三个工具时切换了场景或更新了订单，旧请求即使晚到，也不能覆盖新页面的证据和草稿。示例的请求序号只解决浏览器内结果覆盖问题，并不能撤销已经在服务端发生的操作；所以真实写入必须在服务端再次核对版本和权限。本文没有写入工具，正是为了让读者先把只读预检与真正申请分成两个清楚的步骤。

| 页面状态 | 触发示例 | 下一步 |
| --- | --- | --- |
| `ready` | 三份证据和候选字段一致 | 人工审阅草稿，仍未提交 |
| `blocked` | 任一只读工具超时 | 恢复查询，不猜测缺失值 |
| `stale` | 订单修订号不同 | 重读订单并重新生成 |
| `rejected` | 金额超额、抬头不符或引用错误 | 修正输入与来源，不展示草稿 |

本地来源 ID 和版本号只是一组可重复的教学值。真实接入时，服务端必须核对当前用户是否有权访问订单和抬头，把引用、规则版本、金额快照和申请草稿绑定到同一任务；前端显示的校验结果不能替代服务端复算。候选 JSON 是固定模拟响应，离线断言也没有证明模型会正确选择工具或理解真实税务政策。

## 运行、失败验证与人工边界

使用 Node.js 22 或更新版本，解压源码包后运行：

```bash
npm ci
npm run typecheck
npm test
npm run build
python3 -m http.server 8765
```

打开 `http://127.0.0.1:8765/`，在顶部依次试“证据齐全”“新增退款”“抬头不符”“订单查询超时”和“订单版本已变化”。`npm test` 用固定夹具覆盖成功、金额超额、来源伪造、结构错误、三项读取失败与版本过期。测试只证明这些离线条件成立；它不是端到端开票验收，更不代表真实模型质量。想接入实际业务，应先取得正式规则、字段契约和权限边界，再用服务端幂等申请、人工确认与最终状态查询完成闭环。

“人工已核对”复选框只改浏览器内状态。这个示例没有提交按钮，**不会开票或发送邮件**。Agent 在这里的作用，是把分散的订单、抬头和规则变成一份有来源、有金额计算、能被人审阅的申请草稿；是否真的具备开票资格，仍由真实业务系统与负责人判断。
