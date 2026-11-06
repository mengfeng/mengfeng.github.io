# Agent 业务轨迹离线回放

演示 Vue 3 + TypeScript 页面和固定用例评测器。双击 index.html 或运行 python3 -m http.server 8096 --bind 127.0.0.1，然后打开 http://127.0.0.1:8096/。

改源码：Node.js 22+；npm ci；npm run typecheck；npm test；npm run build。app.js 已打包 Vue 运行时，离线打开不请求 CDN 或模型 API。

“基准版本”六例应全部通过；“故障版本”六例应全部失败。故障中包括回答看似正确却越权调用工具、未确认就保存、超时后虚构库存、重复写入。所有轨迹是手写模拟记录；页面回放不执行工具，不触发真实订单、付款、地址修改或对外消息。这个示例只能验证评测器的规则，不能证明真实模型通过。
