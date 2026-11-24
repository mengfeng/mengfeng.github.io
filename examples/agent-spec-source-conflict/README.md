# 商品规格复核

Vue 3 + TypeScript。演示数据和 Agent 响应都是固定样本。示例在浏览器本地运行，草稿仅保存在页面内存，刷新即清空。

直接用浏览器打开 `index.html` 即可体验。页面已包含打包后的 Vue 和应用，无需联网。

## 运行源码

环境使用 Node.js 22。解压后进入含 `package.json` 的目录。

```sh
npm ci
npm run typecheck
npm test
npm run build
python3 -m http.server 8077
```

浏览器打开 `http://127.0.0.1:8077/`。依赖首次安装需要 npm 缓存或网络。

- `src/fixtures.ts` 保存演示快照与模拟候选。
- `src/core.ts` 过滤有效记录、换算单位、检查冲突和候选。
- `src/app.ts` 展示资料原值、判定和本地草稿。

默认场景下供应商给出 32 cm，质检给出 340 mm，页面停在人工复核。切到「不同单位，数值一致」，确认 32 cm 与 320 mm 一致后，可以把 320 mm 填入本地草稿。详情页原值始终保持 300 mm。另有资料缺失、旧快照、跨 SKU 引用、错误换算与异常结构的场景。
