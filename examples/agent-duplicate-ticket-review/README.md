# 重复客服工单核对 Agent：本地演示

需要 Node.js 22 或更新版本。解压 `source.zip`，在该目录运行：

```bash
npm ci
npm run typecheck
npm test
npm run build
python3 -m http.server 8765
```

打开 `http://127.0.0.1:8765/`，切换固定场景并点击“读取证据并核对”。页面只给出可审阅建议，不合并或关闭工单。工单、账户归属、规则与模拟 Agent 候选都是虚构夹具；“超时”由本地拒绝的 Promise 模拟，未调用真实模型或客服系统。

`src/core.ts` 包含模拟只读工具、运行时候选解析与证据校验；`src/app.ts` 负责 Vue 状态和界面。真实接入必须在服务端从会话识别账户、逐张工单鉴权，合并时再次检查版本、角色权限和操作结果，不能依赖本示例的浏览器端判断。
