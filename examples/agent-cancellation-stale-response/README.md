# Agent 取消与过期响应演示

Vue 3 + TypeScript。模型决策固定为选择一个只读查询工具；商品、价格、延迟和错误均为本例公开编写的演示数据。没有模型 API、HTTP 请求、真实账号或业务写操作。计时用于制造可复现的竞争条件，不代表真实工具性能。

## 直接运行

ZIP 已含 app.js 和 Vue 运行时代码，不需要安装依赖或 API Key。可以直接打开 index.html，也可以在解压目录运行：

```sh
python3 -m http.server 8088 --bind 127.0.0.1
```

访问 <http://127.0.0.1:8088/>。公开博客中的演示运行相同静态文件。

## 修改源码与离线测试

需已安装 Node.js/npm。重建依赖需要连接 npm；本例在 Node 18.12.1 / Node 24 下完成构建，14 组核心测试在 Node 24 下执行；依赖为、Vue 3.5.43、TypeScript 5.7.2、esbuild 0.28.2。

```sh
npm ci
npm run typecheck
npm test
npm run build
```

src/core.ts：控制器、unknown 工具结果校验、可控延迟工具。
src/app.ts：Vue 输入、按钮、结果和组件卸载清理。
test.ts：使用可手动 resolve/reject 的工具验证竞争顺序，不依赖随机网络延迟。

## 交互验证

- 正常完成：320ms 后展示通勤包。
- 旧慢新快：启动 950ms 通勤查询；120ms 后启动 320ms 运动查询。旧工具故意忽略 signal，晚返回也必须保留运动包。
- 旧任务迟到报错：旧工具 950ms 后抛错，新任务先完成。旧错误不得覆盖成功状态。
- 停止后仍返回：工具忽略 signal，150ms 自动停止；950ms 返回后依然保持 canceled，无商品。可随时手动点击停止。
- 当前数据不合法：返回缺少价格字段，进入 error，不显示部分商品。
- 输入其他关键词：空结果是成功状态，不能误报失败。输入空条件：错误且不调用工具。
- 查询过程中可以再次查询；输入框是未提交文本，结果区显示已提交条件快照。

## 核心约束

createSearchController(tool, onState) 返回 start(query, scenario?)、stop()、dispose() 和 getState()。

新任务先增加 generation、替换 active，再通知旧 controller.abort()。停止先增加 generation、移除 active、公布 canceled，最后 abort()。try、catch、finally 只有通过 isCurrent(id, signal) 才能更新页面；旧 finally 也不能关闭新任务的 busy。组件卸载调用 dispose，不再触发 onState。

AbortController 是协作式中止信号。忽略信号的工具仍可能完成。本例 taskId 只控制当前页面接受哪份结果，不能撤销服务端已执行的写操作，也不能保证跨标签页、刷新后或不同用户的数据顺序；真实写操作还需服务端授权、幂等和结果查询。

结果校验最多 3 个商品，ID 不重复，名称长度 1–80，价格为有界非负整数分。它只检查本例结构，不证明工具来源可信。Vue 用文本节点渲染名称，不使用 innerHTML。

为了保持最小示例，没有实现真实模型规划、流式响应、自动重连、远程服务、全局超时或全站状态管理。生产接入 fetch 时，将同一 signal 传给 fetch，并在读取响应体后仍做当前任务校验。

## 验证证据

验证结果.json 记录本候选的 typecheck/build/核心测试结果与 app.js SHA256。浏览器检查证据由发布流程单独保存，不把单元测试写成真实模型验证。
