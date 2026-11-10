# 多工具商品比较 Agent 演示

所有商品、库存、价格和优惠均为固定虚构数据。`queryTools()` 只调用本地 Promise，`mockCandidate()` 是固定模拟回答，不连接模型或业务服务，不会下单。

已构建的静态页面：在本目录运行 `python3 -m http.server 8100 --bind 127.0.0.1`，打开 http://127.0.0.1:8100/ 。无需 API 密钥。

修改 TypeScript：Node.js 22+，执行 `npm ci && npm run typecheck && npm test && npm run build`。首次 `npm ci` 需要访问 npm 注册表。源码在 `src/`，静态产物 `app.js`。测试只验证固定离线样本。

试验顺序：默认查询三个工具并验证模拟回答；切换库存超时、优惠超时、结果过期；勾选伪造来源；查询后改变商品选择版本。超时场景只显示已核实字段，不给综合推荐；过期或版本变化需要重查；伪造引用被拒绝。

Vue 许可见 `VUE-LICENSE.txt`。真实接入时应由后端按账号授权执行商品和价格查询，并在最终购买时重新核对库存与价格。
