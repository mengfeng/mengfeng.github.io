# 艺术码畜博客发布仓库

这是 GitHub Pages 的静态发布文件。历史文章和 URL 保持原路径；新增文章由仓库外的发布脚本生成，不能把这个目录当作完整的 Hexo 源码工程。

发布前在仓库根目录运行：

```sh
python3 scripts/build_sitemap.py
python3 scripts/compact_search.py
python3 scripts/check_site.py
```

`build_sitemap.py` 从 Git 索引和工作区中的页面生成 `sitemap.xml`，兼容稀疏检出；`compact_search.py` 把站内搜索内容整理为每篇最多 1000 字的开头文本，避免在打开搜索框时下载完整文章 HTML；`check_site.py` 检查首页和 2026 年文章等关键页面、元信息、本地链接、站点地图，以及索引长度。三者均只使用 Python 标准库，不发起网络请求。

每日发文脚本使用 `scripts/article-template.html` 生成新文章，并在同一份发布计划中更新 `sitemap.xml`；旧版站点仍可使用原模板。站点升级合并后，新文章会自动继承此模板。

日常发布流程应在生成页面和搜索索引后、提交前运行这三条命令。发布脚本位于本仓库外的 `../tools/append_post.py`，会优先调用本仓库的搜索压缩脚本。`.github/workflows/check-site.yml` 还会在 PR 和推送到 `master` 时运行检查。旧文章页面仍沿用原路径。

页脚先显示经 GA4 报告核实的活跃用户和浏览次数，日期和口径写在 `/data/analytics.json` 中；同源文件读取失败时显示已核实的旧快照和明确的失败提示。`/js/busuanzi-2.3.pure.min.js` 保留原文件路径，以兼容所有历史页面；旧不蒜子接口在检查时无法可靠返回数据，页面不再为每次访问发起故障请求。原服务的历史 UV/PV 没有可核实的数值，因此没有被迁移或伪造；如果将来取回原记录，需要先核对口径和数值再决定展示方式。本地预览不请求统计接口。GA4 活跃用户与不蒜子 UV 的口径不同，不应相加或互称。

`.github/workflows/refresh-ga4.yml` 每天 08:30（北京时间）尝试更新截至前一天的 GA4 快照。**目前仓库没有 `GA4_SERVICE_ACCOUNT_JSON` Secret，因此该定时任务不会更新数字。**启用时需要在 Google Cloud 启用 GA4 Data API，创建只读服务账号并授予该账号对 GA4 属性 `339945718` 的读取权限，再把账号 JSON 存为仓库 Secret `GA4_SERVICE_ACCOUNT_JSON`。不要把凭据写进静态文件、提交记录或浏览器 JavaScript。任务会核对指标列、数据质量和明显异常回退，然后才提交更新；API 故障时保留旧快照。具体 API 指标为 `activeUsers` 和 `screenPageViews`。
