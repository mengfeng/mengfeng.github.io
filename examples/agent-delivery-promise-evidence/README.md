# 配送承诺证据实验室

这是 Vue 3 + TypeScript 的静态演示。`index.html`、`app.js`、`style.css` 可直接放在静态服务器上运行；不需要 API Key 或联网调用模型。

```bash
python3 -m http.server 8098 --bind 127.0.0.1
```

打开 http://127.0.0.1:8098/ 。修改 TypeScript 源码需要 Node.js 22+：

```bash
npm ci
npm run typecheck
npm test
npm run build
```

演示数据和时间固定在 `src/core.ts`。默认模式两项只读工具均可用；切换场景可查看缺货、配送未覆盖、超时、过期。选择“虚构证据并承诺”应被拒绝。所有数据和模拟 Agent 输出都是固定样本，无真实模型、库存、物流、订单或写操作。
