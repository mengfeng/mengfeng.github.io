# Agent 工具进度：Vue 3 + TypeScript + 本地 HTTP SSE

这是固定模拟模型、本地只读商品数据和事件协议的教学示例，没有真实模型、商城服务、账号授权、购买、支付或对外通知。三个步骤是理解固定条件、查询两件虚构商品和整理固定结果。最终商品一次完整返回，**不是模型 token 流式输出**。

## 两种体验

- 直接双击 `index.html`：默认“离线字节回放”。Vue 已包含在 `app.js`，没有 CDN、密钥或外部请求。公开 GitHub Pages 页面也只有这个回放模式。
- 下载解压后用 Node.js 22/24 运行 `npm run serve`，浏览器打开 `http://127.0.0.1:8087/`，选择“同源 Node HTTP SSE”。服务仅监听回环地址，`PORT=8088 npm run serve` 可修改端口。预构建文件已包含，因此运行服务无需先安装依赖。

HTTP 模式通过 `fetch('/api/progress?...')` 读取真实本地 HTTP 响应，检查 `text/event-stream` 后用 reader 分段接收。正常、工具失败、重复事件场景由服务惰性推进事件生成器并逐个写入事件；写出 query-running 后才调用同步只读 readDemoProducts。每次间隔 100 毫秒仅便于观察。split、coalesced、truncated 使用预生成的相同工作流事件作为传输夹具，不演示实时工具执行。split 按 7 字节拆写、间隔 2 毫秒，coalesced 一次写多事件。**HTTP/浏览器可能再次合并或拆分字节，不能把服务 write 边界当作浏览器 chunk 边界。** 强制 UTF-8 中文跨字节由单测验证。

共用 `src/core.ts` 中的事件序列和编码；`protocol.mjs` 是该源码预构建的 Node 模块。理解条件和结果说明是固定夹具，本地商品查询也只是演示数据读取，等待时间不证明真实模型或工具耗时。

## 事件与界面

```text
id: 2
event: progress
data: {"stage":"query","status":"running","label":"正在调用本地只读商品工具。"}

```

`progress` 更新 understand/query/compose 步骤，`result` 一次完整提供两件商品，`error` 明确失败并结束。终态失败时执行中的步骤标记失败；缺少完整终态、最后事件截断或 JSON/字段不合法时不显示成功。重复 ID 仅采用第一次事件，不重复业务列表。

六个场景：normal、split、coalesced、duplicate、tool-error、truncated。静态回放和 HTTP 服务共用相同编码；前端禁止并发开始，运行中不能重置或切换场景。没有实现中途取消、跨任务过期响应控制，这些需要另外设计。

解析器是本例协议子集：UTF-8 增量解码（错误字节拒绝）、LF/CRLF、id/event/data、注释、多行 data；不实现裸 CR 分隔、默认 message、retry、自动重连或 Last-Event-ID 的完整 EventSource 语义。ID 要求 1–4 位数字。每轮最多 32 个线框（含注释）、65536 字节总量、8192 字符未完成事件缓冲；读取上限 1024 次。它没有请求空闲超时，不能直接作为长期生产连接使用。

## 从源码重建与测试

需要 Node.js 22/24 与 npm。依赖固定为 Vue 3.5.43、TypeScript 5.7.2、esbuild 0.28.2，锁文件固定传递版本。第一次安装会从公开 npm registry 下载依赖，随后网页与本地服务无需外部网络。

```sh
npm ci --registry=https://registry.npmjs.org
npm run typecheck
npm test
npm run build
npm run test:http
npm run serve
```

核心测试覆盖正常进度、逐字节中文解码、多事件合并、去重、工具失败、截断/缺少终态、CRLF/多行 data/注释、坏数据及各项边界。HTTP 集成测试临时监听 127.0.0.1 的随机端口，实际读取六个场景，核对响应类型与最终语义；测试结束会关闭服务。浏览器检查需要另行核对进度先于最终结果出现、六种场景、重置和电脑手机布局。

源码只用固定模拟模型，不评估真实模型遵守协议的能力；本地 HTTP 成功不代表代理缓冲、生产超时、鉴权、重连或真实依赖验收完成。

Vue 许可证见 `VUE-LICENSE.txt`，构建产物保留依赖版权注释。
