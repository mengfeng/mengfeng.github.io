# Agent 订单工具与演示会话权限

Vue 3 + TypeScript，模型决策固定为选择只读订单工具，不做真实模型调用。两组账号与订单均为公开编写的假数据：A / DEMO-A-1001（演示通勤包），B / DEMO-B-2001（演示运动水杯）。没有真实账号、订单、凭据、数据库、订单写操作或对外消息。

## 直接运行离线页面

解压打开 index.html，不需要安装依赖、模型 Key 或 CDN。也可用普通静态服务打开，但不要占用本例 HTTP 端口 8090。

离线页面在浏览器内创建模拟 service，选择 A/B 后保存内存 token，只验证规则和页面状态。全部演示订单随公开 app.js 打包，可从源码查看；离线模式不提供数据保密或真实鉴权，刷新清空。

## 运行真实本地 HTTP 路径

需要 Node.js；本次 Node 24.22.1 验证。已构建 app.js 与 service.mjs 随包提供，直接启动无需 npm ci：

```sh
npm run serve
```

浏览器打开 <http://127.0.0.1:8090/>。服务固定监听 127.0.0.1:8090。只有该 loopback 8090 页面自动使用同源 API；公开 GitHub Pages 和 file:// 页面走离线模式，不访问读者电脑端口。

本地 HTTP 使用随机会话 token + HttpOnly / SameSite=Strict Cookie。令牌不放在登录 JSON 响应里，工具请求仅提交 orderId，浏览器发送同源 Cookie。服务从自己持有的 session 取账号，然后检查订单 owner。当前界面显示以服务端成功响应中的身份为准，刷新恢复会话、收到 401 清空过期身份。

**选择模拟账号无需密码，A/B 可以任意选择，不是真实身份认证。** HTTP 会话只演示浏览器到 Node 的会话与权限路径；不能据此声称已经实现生产登录或保护真实数据。本地 HTTP 没有 HTTPS，Cookie 不设 Secure；生产服务需要 HTTPS、真实认证、Secure Cookie、独立的授权与会话治理。

## 操作顺序与预期

- 未选择账号直接查询：401，页面无订单。
- 选择 A 后查询当前账号示例：展示 DEMO-A-1001。
- A 查询 B 的 DEMO-B-2001：404，“未找到可访问的演示订单”。与不存在订单完全相同，错误响应不含 B 订单内容。
- 模型伪造 customerId：400。工具输入严格只允许 orderId，模型参数没有选择账号的入口。
- 选择 B：立即清空旧身份和结果，成功后可查询 B 的订单；旧查询晚到不能恢复 A 的结果。
- 退出：删除服务端会话并清 Cookie；保存下来的旧 Cookie 也不再有权限。
- 会话 5 分钟过期，最多 64 个；过期/退出后需重新选择模拟账号。重启服务清空。

## 接口与代码位置

src/service.ts：createOrderService(makeToken, now?)、login、identity、logout、query。工具 query(token, input) 先校验 session，再校验严格 orderId 字段，最后以 orderId 和 session.account 共同匹配 owner。订单返回不包含 owner 字段。

src/core.ts：createWorkflow(api, publish)，提供 init、choose、logout、query、dispose、getState。本页身份切换会使旧请求失效，旧结果与错误不会改变新页面。成功响应中的服务端 identity 用于修正其他标签页改变 Cookie 后的旧身份标签；没有实现跨标签页实时广播。

src/app.ts：选择账号、输入订单、只读工具快捷场景。普通文本渲染，不把模型内容作为 HTML。

server.mjs：

- POST /api/demo-login：{account:"A"|"B"}，返回 {account,label} 并设置 Cookie。选择账号只是演示控制入口。
- POST /api/session：{}，返回当前会话身份；未登录/过期为 401。
- POST /api/demo-logout：{}，删除 session，清 Cookie。
- POST /api/order-tool：{orderId}，返回 {identity,order}；多余字段 400，未登录 401，无可访问订单 404。

HTTP 仅允许 loopback Host 和对应 Origin，不提供 CORS。写入/查询路由要求 JSON，请求体最多 2048 字节。静态资源只有 /、index.html、app.js、style.css 四条白名单。无 Origin 的本机客户端仍可调用，这是本地演示边界，不等于生产防御。

## 重建与测试

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run test:http
```

重建依赖下载需要 npm 网络；版本固定 Vue 3.5.43、TypeScript 5.7.2、esbuild 0.28.2。HTTP 测试自行启动并关闭 8090，运行前关闭同端口服务。

本次 18 组核心测试覆盖归属、未登录、统一 404、伪造参数、退出/过期、会话上限、刷新恢复、切账号清理、旧响应、401、服务端身份和卸载等。17 个真实回环 HTTP 检查覆盖 Cookie 标记/JSON无token、身份恢复、A/B 访问、无内容泄漏、伪造参数、Cookie失效、Host/Origin、JSON和体积限制、静态白名单等。验证结果.json 保存命令结果与 app.js SHA256。浏览器交互验证由博客发布流程另存。

## 未覆盖范围

没有真实模型工具规划、真实登录凭证验证、生产数据库、多租户、生产权限策略、会话持久化、分布式撤销、限速、防枚举时序分析或生产攻击面测试。统一 404 的示例只约束本次响应状态与内容，不证明请求时延相同或防御完备。生产数据不可放进前端 bundle，生产工具必须从可信登录上下文确定主体并逐次执行账号归属检查。
