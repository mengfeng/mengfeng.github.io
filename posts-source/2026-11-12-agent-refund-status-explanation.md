## “退款到哪了”不能只查一个状态

用户在售后页问 Agent：“退款进度到哪一步了？”这句话可能在问三件不同的事：申请是否提交，商家是否审核通过，支付渠道是否已经处理。用户通常最关心的是钱是否真的回到自己的账户，但商家的退款单和支付渠道的处理记录都不能单独证明这一点。若页面把“审核通过”显示成“已到账”，一句看似省事的回答就会制造误解。

这篇用 Vue 3 + TypeScript 做一个最小可运行实验：读取**虚构退款单**和**虚构支付渠道记录**，核对两份证据的归属、版本、金额和时间，再生成可展示的阶段说明。示例编号是 `RF-DEMO-024`，金额 129 元，演示时钟固定为 **2026-11-12 20:00（北京时间）**。所有数据和回答都是预设样本；`mockCandidate()` 不调用真实模型，两个工具也不连接商城或支付系统。页面不会发起真实退款、付款、短信或邮件。

![手绘机器人对照退款单与渠道记录，在冲突处停下核对](/images/agent-refund-status-explanation/flow.webp)

## 页面交互：证据分两列，结论分四步

用户先选择场景，再点击“查询并核对”。页面左侧列出 `refund.read` 的申请与审核状态，右侧列出 `channel.read` 的渠道处理状态；回答区给出本轮可核实的结论。下方始终显示四个阶段：**退款申请 → 商家审核 → 支付渠道处理 → 用户实际到账**。最后一个阶段在本例里始终没有本人账户证据，所以不被标成完成。

本例的两项只读工具同时启动，并使用 `Promise.allSettled()` 收集成功或失败结果。[MDN 文档](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/allSettled)说明，它会等待每个输入 Promise 完成或拒绝，再按输入顺序返回各自状态。这里退款单是解释的前提；若退款单找不到，渠道记录即使有数据也不在页面展示，避免把一个未核对归属的渠道结果贴到当前用户的售后页。渠道查询超时时，则仍可保留已核对的退款单状态，但不能补出渠道结论。

```ts
const [refund, channel] = await Promise.allSettled([
  readRefund(scenario),
  readChannel(scenario)
])
return {
  refund: refund.status === 'fulfilled'
    ? { ok: true, value: refund.value }
    : { ok: false, reason: 'not_found' },
  channel: channel.status === 'fulfilled'
    ? { ok: true, value: channel.value }
    : { ok: false, reason: 'timeout' }
}
```

这段是演示夹具的简化流程。完整版本还把页面当前版本放进快照。两个失败原因来自固定场景，而非真实 API 错误码；实际接入不能把任意网络错误一概翻译成“退款单不存在”。后端需要先验证账号和订单归属，再调用渠道查询，并把鉴权失败、未找到、超时、服务故障区分开。静态前端的状态类型无法代替服务端授权。

| 证据 | 本例提供 | 不能由它单独推出 |
| --- | --- | --- |
| `refund.read` | 申请、审核状态、版本、金额、查询时间 | 支付渠道已处理或用户实际到账 |
| `channel.read` | 渠道处理阶段、绑定的退款单与金额 | 用户银行账户已经入账 |
| 本人账户账单 | 本示例没有 | 因而不能作出“实际到账”结论 |

## 状态机比一句“退款成功”更诚实

`ReviewStatus` 只有申请已提交、审核中、审核通过、审核未通过；`ChannelStatus` 只有未开始、处理中、渠道标记完成。正常路径里，“审核中 + 渠道未开始”可以解释成申请已受理、仍待审核；“审核通过 + 渠道处理中”表示商家已同意，渠道尚未标记完成；“审核通过 + 渠道标记完成”也只表示渠道侧记录完成。示例没有用户钱包或银行流水，因此仍提示“请以本人账单核对实际到账”。

这不是对所有支付机构的通用状态定义。真实业务中，“渠道完成”的语义可能是已受理、已出款、已清算或已退到原路，具体须以机构接口契约和商家业务规则为准。本例只展示一个**明确写在代码里的演示状态机**，不承诺到账时限，也不虚构退款成功率。

最关键的核对发生在组合两份记录之前：`refundId`、退款版本和整数分金额必须一致，查询时间距演示时钟不超过五分钟。五分钟仅是固定样本的判定阈值，不建议原样搬到生产。如果退款单仍显示“审核中”，渠道却标记“完成”，页面显示“需人工核对”，不擅自解释成审核已通过，也不触发任何退款写操作。

```ts
if (channel.refundId !== refund.refundId ||
    channel.refundVersion !== refund.version ||
    channel.amountCents !== refund.amountCents) {
  return 'conflict'
}
if (refund.status === 'approved' && channel.status === 'processing') {
  return 'processing'
}
```

`amountCents` 使用整数分，是为了让两份记录的金额比较明确；本例没有金额计算或支付动作。真实退款可能涉及部分退款、运费、积分、手续费和多支付渠道，不能用这里的单金额相等规则替代完整对账。

## 模拟 Agent 回答只能引用本轮证据

`mockCandidate()` 返回固定的阶段标签、来源 ID 和一句占位消息。`verify()` 不直接把占位消息展示给用户，而是先根据工具快照计算可接受的阶段，再检查候选的引用是否恰好来自本轮可用证据。模拟回答若加入不存在的 `refund.write#fake`，或宣称 `actual_arrival`，页面拒绝展示该主张。即使候选引用了真实来源，只要它把“渠道处理中”说成“审核中”，也会被拒绝。

[TypeScript 官方的类型收窄说明](https://www.typescriptlang.org/docs/handbook/2/narrowing.html)介绍了通过联合类型字段区分分支。本例用 `{ ok: true, value } | { ok: false, reason }` 表示工具结果，让页面必须先判断 `ok` 才能访问记录。[Vue 官方 TypeScript Composition API 指南](https://vuejs.org/guide/typescript/composition-api)展示了带类型的 `ref()` 用法；示例把本轮快照与核验后的回答分别存入 `ref<Snapshot | null>` 和 `ref<Answer | null>`。模板只做文本插值，不把模拟回答当作 HTML 注入。

如果用户查询后在页面切换了订单版本，原回答马上标记为失效。重新点击查询时，工具夹具仍给旧版本 7，而页面版本已经是 8，核验会要求重新取证。这个演示体现了“旧快照不能背书新页面”的原则；真实环境还需要服务端生成版本或请求 ID，防止浏览器伪造。

## 跑一遍成功和失败场景

[打开静态演示](/examples/agent-refund-status-explanation/)或[下载完整源码 ZIP](/examples/agent-refund-status-explanation/source.zip)。ZIP 已包含 `index.html`、`app.js` 和 `style.css`，解压后进入目录运行：

```bash
python3 -m http.server 8100 --bind 127.0.0.1
```

浏览器打开 `http://127.0.0.1:8100/`，无需模型密钥。若要修改源码，使用 Node.js 22 或更新版本，依次运行 `npm ci`、`npm run typecheck`、`npm test`、`npm run build`；首次安装可能需要访问 npm 注册表。

默认“申请已提交，正在审核”场景应只说明商家审核进度。切换到“渠道处理中”时仍不能说实际到账；“渠道标记完成”要提示核对本人账单。“退款单未找到”不能推断用户从未申请；“支付渠道查询超时”只保留商家侧已知状态；“退款单与渠道状态冲突”要求人工核对；“证据查询时间过期”要求重查。还可以勾选伪造引用，或查询后改变页面版本，验证旧回答被拒绝。

本地离线测试覆盖 21 项固定断言，并完成 TypeScript 检查、静态构建和浏览器布局检查。**这些只证明演示代码对固定样本的处理，不是生产退款验证，也不是模型评测。** 实际接入还要设计身份授权、渠道状态映射、错误码、对账、人工转接与审计。Agent 在这里做的事是解释证据的边界，让用户清楚知道哪一步已核实，哪一步仍未知。
