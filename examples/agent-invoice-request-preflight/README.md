# 发票申请资料预检 Agent：本地演示

需要 Node.js 22 或更新版本。解压 `source.zip` 后在该目录运行：

```bash
npm ci
npm run typecheck
npm test
npm run build
python3 -m http.server 8765
```

打开 `http://127.0.0.1:8765/`。顶部可切换十种固定场景。所有订单、开票抬头、规则和候选均为虚构夹具；读取超时也由本地 `Promise.reject()` 制造。没有真实模型、订单 API、开票、付款或对外消息调用。页面“人工已核对”仅改变浏览器内状态。

`src/core.ts` 是只读证据、金额计算和候选校验；`src/app.ts` 是 Vue 交互。`npm test` 运行固定离线断言。真实接入时应在服务端做身份和订单归属校验，以真实开票政策、票种、税务字段及审计流程为准，不能将这个教学示例当作开票资格判断。
