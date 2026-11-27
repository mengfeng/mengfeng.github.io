# 渠道文案长度检查

浏览器直接打开 `index.html` 可离线体验。站内推荐卡规则为 12 个字素簇，合作渠道规则为 24 个 UTF-8 字节，两个渠道和候选皆为虚构演示。

使用 Node.js 22 或更高版本。要重新构建，在这个目录运行：

```sh
npm ci
npm run typecheck
npm test
npm run build
python3 -m http.server 8077
```

打开 `http://127.0.0.1:8077/`。依赖首次安装需要网络或 npm 缓存。浏览器需要支持 `Intl.Segmenter` 和 `TextEncoder`。

- `src/fixtures.ts` 保存规则及模型候选样本。
- `src/core.ts` 提供计数、渠道校验和候选校验。
- `src/app.ts` 负责编辑、换渠道及用户主动采用候选。

默认标题在推荐卡满足规则，切到合作渠道则超限。按钮只替换本地输入内容。你也可以直接编辑原文，观察未应用的旧建议失效。
