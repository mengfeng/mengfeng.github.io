## “券不能用”不是一句提示能解释清楚

结算页里，用户问 Agent：“我这张优惠券为什么用不了？”如果 Agent 只看见购物车总额，就很容易回答“还差一点金额”。但优惠券门槛通常只统计**适用商品金额**，并且还受有效期、规则版本和购物车变化影响。把“满 100 元”直接等同于“购物车总额满 100 元”，可能把一个不适用的商品算进去。更糟的是，规则查询失败时，页面若把失败当成“不可用”，用户会误以为资格已经查清。

这篇做一个 Vue 3 + TypeScript 的最小演示：先读取演示购物车与演示券规则，再由页面计算资格，最后核对模拟 Agent 的解释。结果只有三种：**符合演示条件、已知条件不符合、暂不能判断**。即便符合演示条件，也只是固定样本中的展示结论，结算服务仍需重新核验，不表示券已核销或优惠已到账。

所有商品、价格、优惠券 `SAVE20` 和时间都是虚构数据。演示时钟固定在 **2026-11-09 20:00，北京时间**。`TEA` 单价 68 元、`CUP` 单价 54 元；券仅适用于 `TEA`，适用商品满 100 元减 20 元。这里没有真实模型调用、真实购物车、支付或优惠券服务，也不会提交订单。

![手绘机器人核对优惠券的购物车、适用规则与有效时间](/images/agent-coupon-eligibility-explanation/flow.webp)

## 让两个只读工具各说各的事实

工具一返回购物车版本、商品行、数量和以“分”为单位的价格；工具二返回券的适用商品、门槛、优惠额、到期时间和规则版本。两份成功结果都带 `sourceId`、`checkedAt`，查询超时则只保留请求 ID 和 `timeout` 状态。金额用整数分计算，展示时才格式化为元，避免把浮点表示误差混入资格判断。

| 只读工具 | 本例返回什么 | 失败时页面怎么处理 |
| --- | --- | --- |
| `readCart` | `revision`、商品行、`sourceId`、`checkedAt` | 没有本轮购物车快照，就不解释本轮资格 |
| `readCouponRule` | `eligibleSkus`、`minCents`、`expiresAt`、`ruleVersion` | 超时或结果过期时显示“暂不能判断” |

[OpenAI Function Calling 文档](https://developers.openai.com/api/docs/guides/function-calling)把模型提出工具调用、应用侧执行工具、再把结果交回模型分为不同步骤。本例没有实现真实 API 对话：`readDemoTools()` 只是按下拉选项返回固定本地数据，`mockAgentAnswer()` 只是生成固定候选对象。这样读者不需要模型密钥，也能单独检查“工具事实如何约束页面回答”。真实接入时，购物车和券规则应由可信后端按当前账号查询，模型不能自己发明工具结果。

默认场景里，购物车是两件 `TEA` 加一件 `CUP`。购物车总额为 190 元，但适用商品金额是 **136 元**；门槛判断应使用后者。“未达到门槛”场景保留一件 `TEA` 和一件 `CUP`，总额 122 元，看似超过 100 元，实际适用金额只有 68 元。这是本文刻意保留的反例。

## 页面先计算资格，再读取模型候选

纯函数 `decide()` 先处理缺失或过期证据，再检查到期时间、适用商品和门槛。查询超时只能得出“未知”，不能偷换成“券不可用”。过期时间戳也不能支撑当前结论。本例设置三分钟演示新鲜度，只为测试固定样本；生产中的有效期应由业务服务定义，不能照搬这个数字。

```ts
const qualifiedCents = cart.lines.reduce(
  (sum, line) => sum + (
    rule.eligibleSkus.includes(line.sku) ? line.quantity * line.unitCents : 0
  ),
  0
)
if (Date.parse(now) >= Date.parse(rule.expiresAt)) {
  return { verdict: 'ineligible', reason: '演示券已过期。', qualifiedCents }
}
if (qualifiedCents === 0) {
  return { verdict: 'ineligible', reason: '购物车没有适用此券的商品。', qualifiedCents }
}
```


完整函数见源码包 `src/core.ts`。代码中时间字符串包含 `+08:00`，再用 `Date.parse()` 比较毫秒值；[MDN 的 `Date.parse()` 文档](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/parse)说明，带时间但不带时区的字符串会按设备本地时区解释。演示故意使用明确时区，避免用户电脑在其他时区时改变“是否过期”的判断。真实系统还要明确规则生效时区、券实例时区和服务端时钟。

到期、无适用商品与未达门槛都属于“已知条件不符合”；它们应给出不同的解释。超时和旧数据属于“不知道”，不能用同一句红色错误文案掩盖事实边界。示例把 `ruleVersion` 显示在工具记录里，提醒读者每一次资格判断都应对应某版规则；它不是签名，也不能阻止前端伪造。

## 模拟 Agent 的解释也要验明来源

模拟回答带当前查询 `key`、券 ID、购物车版本、结论、理由和来源 ID。页面验证字段集合、当前选项、来源数组和结论是否与 `decide()` 一致。候选理由即使文字流畅，也不能替换页面根据工具事实生成的理由；页面最终显示的是纯函数的 `reason`。Vue 使用文本插值显示它，不将模型输出当 HTML 注入。

```ts
if (snapshot.key !== selectionKey(current) || snapshot.cart.revision !== current.revision) {
  return reject('购物车或演示条件已变化，旧结果不能使用。', fallback)
}
if (!Array.isArray(raw.sourceRefs) || raw.sourceRefs.length !== refs.length ||
    !raw.sourceRefs.every((ref, index) => ref === refs[index])) {
  return reject('模拟回答引用了缺失或不属于本次查询的证据。', fallback)
}
if (raw.verdict !== fallback.verdict) {
  return reject('模拟回答与可核验的资格结果冲突。', fallback)
}
```

比如选择“伪造证据并承诺”，固定候选会声称可以使用优惠券，却引用不存在的 `rule:invented`。页面拒绝候选，仍显示本地规则结论。再比如先查询版本 1，再把选择框切到购物车版本 2，旧快照不会为新版本作证。这个版本号只是演示关联键；真实服务必须在服务端将账号、购物车版本、券实例、规则版本与计算结果绑定。前端的校验可以改善呈现，不能成为安全边界。

## Vue 交互把查询和解释分开

界面先选“符合门槛 / 未达门槛 / 商品不适用 / 已过期 / 查询超时 / 结果过期”之一，点击“查询购物车与规则”。两张工具卡片展示实际返回。再点击“验证模拟回答”，才运行候选校验。`ref<Snapshot | null>` 保存查询快照，条件变动后页面保留旧卡片用于对照，但显式标注“请重新查询”。[Vue 官方 TypeScript Composition API 指南](https://vuejs.org/guide/typescript/composition-api)展示了为复杂 `ref()` 指定类型的用法。

```ts
const snapshot = ref<Snapshot | null>(null)
const check = ref<AnswerCheck | null>(null)
const query = () => {
  snapshot.value = readDemoTools(current())
  check.value = null
}
const answer = () => {
  if (!snapshot.value) return
  check.value = validateAnswer(
    mockAgentAnswer(snapshot.value, mode.value), snapshot.value, current()
  )
}
```

手机屏幕上，三个选择框和两张结果卡改为单列，查询、核验按钮保持先后顺序。因为工具是本地同步函数，本例不覆盖网络重试和并发请求；接真实服务时还要处理晚到响应、取消请求、券被用完或锁定、用户并行修改购物车等情况。即使页面显示“符合条件”，最终优惠金额仍由结算后端给出。

## 运行并验证六条路径

[打开静态演示](/examples/agent-coupon-eligibility-explanation/)或[下载完整源码 ZIP](/examples/agent-coupon-eligibility-explanation/source.zip)。解压后在目录里运行：

```bash
python3 -m http.server 8099 --bind 127.0.0.1
```

打开 `http://127.0.0.1:8099/`。`index.html`、`app.js` 和 `style.css` 不需要模型密钥。要修改 TypeScript 源码，使用 Node.js 22 或更高版本，首次安装依赖需要访问 npm 注册表：

```bash
npm ci
npm run typecheck
npm test
npm run build
```

依次试六个场景：默认符合条件；总额 122 元但适用金额只有 68 元；购物车只有不适用商品；券已过期；规则查询超时；规则结果已过期。前四项分别给出有依据的可用或不可用结论，后两项必须停在“暂不能判断”。再试“伪造证据并承诺”和查询后切换购物车版本，两者都应被拒绝。离线断言还检查错误字段、空对象、未来时间戳和超时响应不得夹带成功规则字段。

这些验证只覆盖固定本地样本与纯函数。**没有真实模型质量评测，没有真实优惠券核销，也没有真实结算验证。** 生产接入还要由服务端重新计算适用金额、校验优惠券实例状态与互斥规则，并为用户保留可理解的失败原因。Agent 可以把已核实的原因解释得更清楚，但不能替结算系统作最终承诺。
