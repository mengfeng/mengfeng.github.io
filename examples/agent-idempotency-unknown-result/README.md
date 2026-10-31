# Agent 幂等键与结果未知演示

Vue 3 + TypeScript + 可选本地 Node HTTP 服务。订单 `DEMO-ORDER-1001`、两种申请原因和申请记录均为公开编写的假数据；固定模拟 Agent 只建议“演示包装破损”，没有调用真实模型、售后系统、付款、退款或对外消息。

## 两种运行方式

解压直接打开 `index.html`，或用普通静态服务器（例如 `python3 -m http.server 8092 --bind 127.0.0.1`）打开：使用浏览器内的服务与传输模拟。没有业务接口请求。此路径把内存创建与模拟超时分开，但不是实际 HTTP 验证。若浏览器不允许本地文件使用 localStorage，页面会阻止发送；请改用静态本地服务。

要验证真实本地 HTTP，需已安装 Node.js（本例使用 Node 24.22.1 验证）：

```sh
npm run serve
```

打开 <http://127.0.0.1:8091/>。只有 loopback HTTP 8091 页面自动使用同源 API，其余地址（包括公开 GitHub Pages）均使用离线模式。不要用普通静态服务占用 8091。已构建 `app.js` 与 `service.mjs` 随包提供，直接运行不需要安装依赖、模型密钥或 CDN。

## 操作流程

1. 核对固定演示订单与原因。慢响应默认选中。
2. 点击“明确提交演示申请”：生成 `op-` 加 UUID 的操作键，把键与精确 payload 保存到 localStorage，并读回核对，成功后才发送。
3. HTTP 慢响应：Node 先把申请写入进程内存，再等待 650ms 才回响应；浏览器在 200ms 通过 AbortController 中止等待。因此页面显示 unknown，不表示创建失败。离线路径以计时器模拟相同行为，不发送 HTTP。
4. 点击“查询原操作结果”仅查同一个键；找到后显示申请 ID 与记录数。勾选“模拟状态查询失败”会让查询失败，仍保留原键、内容与 unknown。
5. “使用原键重试”是用户明确动作，发送已保存的同一个键与内容，不重新生成键。同一服务进程中，重复键与相同内容返回原记录；不同的有效内容得到 409。
6. 刷新只读 localStorage，恢复 unknown，不自动查询、更不自动创建。HTTP 服务还在时可查询原记录。结果确认后禁用重试和再次查询，避免后续查询失败把已知成功降级为未知。

每页只保留一个操作，不提供在未知时换键新建的入口。提交后原因锁定；恢复页面从原 payload 显示实际原因。localStorage 读取、校验或写入读回失败时进入 blocked，禁止发请求。保存的只是演示内容，不适合存真实敏感材料。

## 共享服务与 API

`src/service.ts` 的规则同时用于 Node 和离线模拟：规范化 `{orderId,reason}` 得到指纹，以 key 查重；同 key 同指纹返回原申请，同 key 不同指纹拒绝 409。检查与内存写入在同步函数内完成，没有 await。最多 64 个记录；达到上限拒绝新键，已有键仍可查重。

- `POST /api/applications`：`{operation:{key,payload:{orderId,reason}},slowResponse:boolean}`。`slowResponse` 只是响应夹具，不纳入业务指纹。即使响应等待被中止，已创建记录也不会回滚。
- `POST /api/status`：`{key,failLookup:boolean}`。查询返回 `{found,application?,totalRecords}`；`failLookup` 只制造演示 503。
- 成功创建响应：`{application:{applicationId,key,payload},totalRecords}`。前端校验响应，并确认 key 与 payload 对应原操作后才报告成功。

HTTP 只监听 127.0.0.1:8091，检查 Host/Origin、application/json 和最多 2048 字节请求体；只提供根页、index.html、app.js、style.css 四个静态文件。不提供 CORS、账号授权或真实认证，仅一个固定演示业务主体。服务端请求超时 5 秒。

## 持久化与幂等边界

**localStorage 保存的是客户端操作，不是服务端申请数据库。** 离线服务在刷新时清空；HTTP 服务在重启时清空。若服务记录已经丢失，查询 not-found 不能证明过去未执行，页面仍保留 unknown。本例不保证跨服务重启、跨标签页或分布式部署后只发生一次业务写入。同键重试只有在原服务保留幂等记录的范围内才能去重；不能将本例的显式重试直接搬到真实服务记录丢失后的流程。

正式业务需要持久化幂等记录与业务写入的原子事务、账号/操作范围绑定、结果查询、保留期限与审计，并处理多标签并发。不要因超时而生成另一键，也不要把状态查询未查到解释为确定失败。本例没实现数据库、跨标签锁定或真实业务补偿。

为了重新体验独立演示，可在另一个独立浏览器上下文打开；不要为了重试原操作清除挂起键。离线与 HTTP 使用不同 localStorage 命名空间，避免把两种服务的键误当成同一个结果。

## 重建与测试

重建需连接 npm 安装锁定依赖（Vue 3.5.43 / TypeScript 5.7.2 / esbuild 0.28.2）：

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run test:http
```

HTTP 测试会自行启动并关闭 8091；运行前先停止手动演示服务。

21 组核心测试覆盖：规范化与校验、同键去重/冲突、有界存储、快照不被外部修改、先持久化再提交、存储失败阻止发送、恢复不自动写、提交成功但响应丢失、查询失败与未查到保留未知、原键重试、双击限制、已知成功不回退、响应错配与卸载迟到。

17 个真实 loopback HTTP 检查覆盖：实际 200ms AbortController 超时后仍查到已创建记录、原键重试不增加记录、有效不同内容 409、并发同键请求去重、查询失败/未查到不写、Host/Origin/路由/类型/体积与无效 JSON。错误 Host 使用 node:http 发送，避免新版 fetch 过滤该头造成误测。

`验证结果.json` 保存本候选的命令、计数与 app.js SHA256。浏览器交互由发布流程单独核验，不将离线模拟或本地 HTTP 测试写成真实模型/生产验证。
