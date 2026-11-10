# 优惠券资格证据实验室

Vue 3 + TypeScript 静态演示。所有商品、金额、规则与模拟 Agent 输出都是固定样本，没有真实模型调用、真实优惠券、支付或订单写入。`index.html`、`app.js`、`style.css` 可以由本地静态服务器直接打开：

```bash
python3 -m http.server 8099 --bind 127.0.0.1
```

打开 http://127.0.0.1:8099/ 。如需修改 TypeScript 源码，使用 Node.js 22+：

```bash
npm ci
npm run typecheck
npm test
npm run build
```

默认符合演示门槛。试“未达到门槛”可看到总额大于 100 元但适用商品金额只有 68 元；超时与过期应显示暂不能判断；伪造证据应被拒绝。切换购物车版本后旧快照不能继续解释新版本。
