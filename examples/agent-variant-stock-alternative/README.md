# 商品规格与库存核对

直接打开 `index.html` 可离线运行。库存快照和 Agent 候选都是固定样本。切换备选只改这张页面上的规格选择。

## 从源码运行

使用 Node.js 22 或更高版本，在含 `package.json` 的目录运行。

```sh
npm ci
npm run typecheck
npm test
npm run build
python3 -m http.server 8077
```

打开 `http://127.0.0.1:8077/`。首次安装依赖需要网络或 npm 缓存。

- `src/fixtures.ts` 存放演示规格及固定候选。
- `src/core.ts` 逐组合核对库存、快照版本和候选。
- `src/app.ts` 展示库存表、规格选择和需用户采用的备选。

默认燕麦色 S 码售罄。勾选允许换色后，备选会显示同尺码的炭灰色。点击按钮才改变当前选择。可切换清单缺失、库存未知和异常候选等场景。
