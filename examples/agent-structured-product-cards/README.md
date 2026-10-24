# 商品卡片 Agent：Vue 3 + TypeScript 离线演示

这是一个协议与前端展示边界演示。商品目录和两次模型响应均为本地固定夹具；**没有真实模型 API、服务端、网络查询、库存、购买或支付**。两条虚构商品价格为演示数据，不代表市场报价。

## 直接体验

下载整个目录后双击 `index.html`。`app.js` 已打包 Vue，不依赖 CDN，也不需要安装依赖或密钥。

也可以在本目录启动静态服务：

```sh
python3 -m http.server 8787
```

访问 `http://localhost:8787/`。所有执行均在浏览器本地完成；350 毫秒等待只用于观察加载状态，不是模型耗时或 token 流式输出。

## 从源码重建

需要 Node.js 22 或 24 以及 npm。首次安装需要从公开 npm registry 下载依赖；随后打开页面不需要联网。直接依赖锁定为 Vue 3.5.43、TypeScript 5.7.2、esbuild 0.28.2；`package-lock.json` 固定传递依赖。

```sh
npm ci --registry=https://registry.npmjs.org
npm run typecheck
npm test
npm run build
```

`npm run build` 重新生成 `app.js`。`test.ts` 不作为浏览器入口，仅在本机运行。

## 协议流程

1. 固定模拟模型响应给出 `search_products` 的 `function_call`。
2. 应用校验工具名和参数，执行本地只读商品搜索。
3. 把结果作为 `function_call_output` 的字符串输出；模拟第二次模型响应只返回 `productId` 和 `reason`。
4. `parseCards` 从 `unknown` 检查结构、最多 3 张卡片、字段和 ID 归属；名称与整数分价格从**本次工具结果**组装。模型不被允许携带名称或价格。
5. Vue `h()` 的字符串子节点显示原因。HTML 文本原样展示，不使用 `innerHTML` 或 `v-html`。

这不是通用 Agent 运行时，也不验证模型是否遵守真实 API 的结构化输出功能；`function_call` 的字段只是模拟该交互形态。

## 六个可操作场景

| 场景 | 预期 |
| --- | --- |
| 正常推荐 | 两张卡片，¥299.00 / ¥429.00 |
| 模型编造 ID | 整批拒绝，零张卡片 |
| 工具缺少价格 | 工具校验失败，不执行最终模型夹具 |
| 恶意 HTML 文本 | `<img ...>` 作为文字出现，不建立图片元素 |
| 服务失败与重试 | 首次失败；手动重试只读查询成功 |
| 无效 JSON | 解析失败，零张卡片 |

协议错误场景点重试仍失败，避免暗示所有失败都能靠重试恢复。7 个离线测试覆盖成功、ID、缺价、文本保留、重试、坏 JSON/额外价格字段、非法参数/非法价格；真实 DOM 文本安全需结合浏览器检查，不能只靠字符串单测断言。

## 代码入口与边界

- `src/core.ts`：模拟调用、工具校验、最终卡片解析，便于在文章中摘录。
- `src/app.ts`：Vue 状态和文本渲染。
- `index.html` / `style.css` / `app.js`：可离线打开的交付物。

接入真实系统时，工具应在受控服务端执行；商品服务、身份授权、响应超时、库存及下单时价格确认要分别实现。前端校验用于可靠展示，不能替代服务端授权或交易校验。

## 官方参考

- Vue 文本插值与 HTML：https://vuejs.org/guide/essentials/template-syntax.html
- Vue 安全建议：https://vuejs.org/guide/best-practices/security.html
- TypeScript unknown：https://www.typescriptlang.org/docs/handbook/2/functions.html#unknown
- TypeScript 类型缩小：https://www.typescriptlang.org/docs/handbook/2/narrowing.html

Vue 及其依赖遵循各自许可证，打包产物保留依赖许可证注释。
