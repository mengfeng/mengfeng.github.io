## “包裹到哪了”其实在问两套系统

用户在订单页问：“我的包裹到哪了？”订单系统知道这笔交易是否已发货或取消；承运商系统记录揽收、中转、派送、签收等事件。两边可能更新时间不同，甚至给出互相矛盾的状态。若 Agent 只挑一句最新看到的文案复述，就可能把晚到的中转扫描说成“退回中转站”，或把已取消订单上的承运商“签收”直接当成交易完成。

这篇用 Vue 3 + TypeScript 做一个最小可运行示例：从两个只读工具收集证据，按事件发生时间排列物流轨迹，再核对一条固定的模拟 Agent 回答。演示订单号 `DEMO-2048`、轨迹号 `TRACK-DEMO-7` 和所有时间都是**虚构数据**；时钟固定在 **2026-11-11 12:00（北京时间）**。没有调用真实模型、订单接口或承运商，也没有发短信、邮件、退款或任何业务写操作。

![手绘机器人对照订单与物流两份证据，在异常轨迹处停下核对](/images/agent-order-tracking-timeline/flow.webp)

## 先让页面保存证据，再允许回答

用户选择场景，点击“查询并核对”。页面同时启动 `readOrder()` 与 `readTracking()` 两个本地 Promise。前者给出订单状态、版本号、绑定的物流单号和查询时间；后者给出每条轨迹的事件发生时间 `occurredAt` 与系统收到时间 `receivedAt`。这两个时间不能混用：扫描设备可能离线，承运商晚些才把事件上传。页面展示两者，时间线只按**发生时间**排序。

[MDN 对 `Promise.allSettled()` 的说明](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/allSettled)指出，它会等全部输入 Promise 完成或失败，并给出各自结果。这里订单查询是回答的前提，物流查询失败时仍能说“订单显示已发货”，但必须把包裹位置与签收情况标为未知。真实系统还需要明确超时、重试、并发上限和监控；本例只是固定场景，没有网络请求。

| 证据 | 本例字段 | 缺失或冲突时的回答边界 |
| --- | --- | --- |
| `order.read` | 状态、版本、物流单号、查询时间 | 订单不可得就不回答该订单的进度 |
| `carrier.read` | 事件、发生时间、接收时间 | 物流超时只保留订单状态，不猜当前位置 |
| 页面当前状态 | 所看的订单版本 | 页面状态变化后，旧回答立即失效 |

```ts
const [orderResult, trackingResult] = await Promise.allSettled([
  readOrder(scenario),
  readTracking(scenario)
])
if (orderResult.status !== 'fulfilled') throw new Error('无法核对订单')
const snapshot = {
  order: orderResult.value,
  tracking: trackingResult.status === 'fulfilled' ? trackingResult.value : null
}
```

完整实现见源码包 `src/core.ts`。示例故意没有“Agent 自己随便调工具”的部分：工具集合固定为两项只读查询。实际接入时，应由服务端根据登录身份核验订单归属，才能调用承运商查询；前端的禁用按钮或 TypeScript 类型并不是权限边界。

## 用事件时间线承载不确定性

默认场景的订单状态是“已发货”，承运商依次记录 11 月 10 日 09:00 揽收、16:00 运输中、11 月 11 日 08:30 派送中。Agent 可以说“最新可核实事件是派送中”，不能把“派送中”偷换成“今天必达”，也不能写“已签收”。时间线的每项都有来源、发生时间和接收时间；前端使用 HTML `<time datetime>` 保留机器可读时间。[MDN 的 `<time>` 文档](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/time)说明了 `datetime` 的用途与格式。这里使用带 `+08:00` 时区的完整时间，并显式按北京时间显示，避免浏览器本地时区改变文字。

“轨迹晚到”场景把 11 月 10 日 18:00 的中转扫描在 11 月 11 日 11:00 才送达页面。若按“收到时间”取最后一条，界面会把进度倒退成中转。示例先按 `occurredAt` 排序，11 月 11 日 08:30 的派送事件仍是最新发生事件，同时提示有晚到记录。这只是演示规则；真实轨迹还可能补录、更正、撤销，须以承运商定义的事件版本和状态规则为准。

```ts
const timeline = [...events].sort((a, b) =>
  Date.parse(a.occurredAt) - Date.parse(b.occurredAt)
  || a.id.localeCompare(b.id)
)
const latest = timeline.at(-1)
```

仅有时间排序也不够。示例会核对订单绑定的物流单号是否等于物流工具返回的单号；对不上就拒绝把两份数据拼成同一包裹。订单版本若从 7 变成 8，旧快照也不能继续回答。`source` 和 `version` 在示例里是演示字段，生产中还应加入订单 ID、请求 ID、承运商事件 ID、授权主体与服务端快照标识，避免来自不同订单或不同查询轮次的资料被混用。

## 模拟回答必须接受证据校验

`mockCandidate()` 返回固定预设句子，用来演示“模型可能给出的回答”；它**没有真实模型调用**。`verify()` 检查引用是否仅包含本轮可用的 `order.read` 和 `carrier.read`，然后按证据计算可展示的结果。伪造 `warehouse.write` 引用会被拒绝。页面用 Vue 文本插值显示回答，不把候选文字当 HTML 注入。[Vue 官方 TypeScript Composition API 指南](https://vuejs.org/guide/typescript/composition-api)说明了带类型的 `ref()` 等写法；本例用 `ref<Snapshot | null>` 保存快照和 `ref<Answer | null>` 保存核验结果。

取消订单是最容易误读的情况。示例的“订单已取消且轨迹冲突”场景刻意让承运商出现“已签收”事件。它不自动裁定哪个系统正确，也不把“已签收”直接发给用户，而是输出“订单已取消，物流侧记录需人工核对”。客服可以进一步看取消时间、出库记录和签收证明；这一轮静态演示没有这些材料，所以只能停在“不确定”。

物流超时也不是“没有物流”。页面明确显示查询失败，只引用订单工具，不生成空时间线来冒充“无轨迹”。“模拟页面状态变化”会把已有回答标为失效，要求用户重新查询。切换场景之后也必须重新点查询，避免把原场景的结果当成新场景。引用校验属于展示层的保护，真实服务仍需后端验证工具结果，不能相信浏览器传回来的来源 ID。

## 运行并验证这些边界

[打开静态演示](/examples/agent-order-tracking-timeline/)或[下载完整源码 ZIP](/examples/agent-order-tracking-timeline/source.zip)。ZIP 内已有可直接打开的 `index.html`、`app.js` 和 `style.css`。解压后进入目录运行：

```bash
python3 -m http.server 8100 --bind 127.0.0.1
```

浏览器打开 `http://127.0.0.1:8100/`。无需模型密钥。若要修改 TypeScript 源码，使用 Node.js 22 或更新版本：

```bash
npm ci
npm run typecheck
npm test
npm run build
```

首次 `npm ci` 可能需要访问 npm 注册表；本次验收使用本机缓存离线安装。默认场景应显示“配送员正在派送”且“尚无可核实的签收记录”。“物流查询超时”只显示已发货和物流未知；“轨迹晚到”仍以派送事件为最新；“订单已取消且轨迹冲突”要求人工核对；“订单版本变化”与“模拟页面状态变化”都使旧结果失效；勾选“注入伪造引用”应拒绝候选回答。

本地离线测试对这些固定场景及物流单号不匹配、无签收却声称签收等情况运行了 19 项断言，另外做了类型检查、构建和浏览器布局检查。**这些验证只说明演示代码对预设样本的处理符合预期，不等于真实模型评测或线上客服验收。** 接入业务时，还要定义承运商纠错语义、查询时效、跨系统冲突处理、人工转接和审计记录。Agent 的职责是把可核实的状态、来源和未知点说清楚，让用户知道下一步该查哪里。
