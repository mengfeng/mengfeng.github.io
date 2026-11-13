# 退款进度解释 Agent 演示

所有退款单、金额、支付渠道状态和回答都是固定虚构数据。`readRefund()` 与 `readChannel()` 只返回本地 Promise，`mockCandidate()` 是固定的模拟回答；不连接模型、商城或支付渠道，也不执行退款或发送消息。

已构建静态页面：在本目录运行 `python3 -m http.server 8100 --bind 127.0.0.1`，打开 http://127.0.0.1:8100/ 。无需 API 密钥。

修改 TypeScript：Node.js 22+，运行 `npm ci && npm run typecheck && npm test && npm run build`。首次 `npm ci` 可能需要访问 npm 注册表。源码在 `src/`，构建产物是 `app.js`。

试验：默认场景审核中；依次切换渠道处理中、渠道标记完成、退款单未找到、渠道超时、状态冲突、证据过期；勾选伪造引用或查询后改变页面版本。所有状态都不能宣称用户账户实际到账。真实业务需在服务端验证身份、退款单归属、金额、版本与渠道证据；最终到账应以本人账单为准。

Vue 许可见 `VUE-LICENSE.txt`。
