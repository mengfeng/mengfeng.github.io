# 艺术码畜博客发布仓库

这是 GitHub Pages 的静态发布文件。历史文章和 URL 保持原路径；新增文章由仓库外的发布脚本生成，不能把这个目录当作完整的 Hexo 源码工程。

发布前在仓库根目录运行：

```sh
python3 scripts/build_sitemap.py
python3 scripts/check_site.py
```

`build_sitemap.py` 从 Git 索引和工作区中的页面生成 `sitemap.xml`，兼容稀疏检出；`check_site.py` 只检查首页和 2026 年文章等关键页面，核对元信息、本地链接、站点地图，并报告搜索索引体积。两者均只使用 Python 标准库，不发起网络请求。

每日发文脚本使用 `scripts/article-template.html` 生成新文章，并在同一份发布计划中更新 `sitemap.xml`；旧版站点仍可使用原模板。站点升级合并后，新文章会自动继承此模板。

日常发布流程应在生成页面和搜索索引后、提交前运行这两条命令。发布脚本目前位于本仓库外的 `../tools/append_post.py`，因此该检查暂时需要纳入外部发布流程，或手动执行。
