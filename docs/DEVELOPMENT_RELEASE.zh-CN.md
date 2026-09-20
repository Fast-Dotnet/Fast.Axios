# 开发与发布

本文档用于维护 `@fast-china/axios` 2.x。仓库根目录是唯一 npm 包来源，构建、打包和发布都不得依赖重复的子目录 package.json。

## 环境

- Node.js `^22.18.0 || ^24.18.0`
- pnpm `^11.0.0`
- Git，使用 LF 行尾

```bash
corepack enable
pnpm install --frozen-lockfile
```

不得使用 npm 或 Yarn 重新生成锁文件。依赖解析结果以根目录 `pnpm-lock.yaml` 为准。

## 仓库结构

| 路径               | 职责                                                           |
| ------------------ | -------------------------------------------------------------- |
| `src/axios`        | FastAxios 容器、请求流程和公开请求类型                         |
| `src/uni-adapter`  | uni.request、uni.uploadFile、uni.downloadFile 的 Axios adapter |
| `src/unplugin`     | 小程序 FormData/Blob 构建转换                                  |
| `src/index.ts`     | 根包公开入口                                                   |
| `src/vite.ts`      | Vite 子路径入口                                                |
| `src/webpack.ts`   | Webpack 子路径入口                                             |
| `tests`            | Runtime、公开类型、CDN 与发布包契约测试                        |
| `tsdown.config.ts` | ESM 三入口及浏览器 IIFE 构建配置                               |
| `docs`             | API、运行时和维护文档                                          |
| `dist`             | 生成的发布产物；不得手工编辑                                   |

## 设计约束

- 保持 Fast.NET `RequestType` 字符串同步。
- 保持 `method: "upload" | "download"` 作为 uni adapter 的原有文件任务协议。
- `axios.upload()` 和 `axios.download()` 必须固定选择对应文件任务，调用方配置不能覆盖分流结果。
- Fast 项目处理器的 `.use()` 表示替换单个实现，不伪装成 Axios 多拦截器队列。
- Axios 请求实例继续使用原生 request/response interceptor 生命周期。
- 不吞掉取消、网络、HTTP 或 Fast 业务错误，不在抛错前重复输出 console 日志。
- 不默认增加重试、Token 刷新、持久化缓存、UI 框架或生产依赖。
- 不在包导入阶段访问浏览器或 uni-app 全局对象。

## 文档同步

公开行为变更必须同时检查：

- `README.md` 与 `README.zh.md`；
- [api.en](http://docs.fastdotnet.cn/axios/api.en) 与 [api](http://docs.fastdotnet.cn/axios/api)；
- [runtime-contract](http://docs.fastdotnet.cn/axios/runtime-contract)；
- [uni-app-adapter.en](http://docs.fastdotnet.cn/axios/uni-app-adapter.en) 与 [uni-app-adapter](http://docs.fastdotnet.cn/axios/uni-app-adapter)；
- `CHANGELOG.md`；
- 对应公开 API 的 TSDoc/JSDoc。

英文与中文文档必须描述相同的 API、默认值、限制和示例，不得只更新其中一个版本。

## 最小验证

修改期间优先运行与变更直接相关的命令。提交前至少运行：

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm format:check
git diff --check
```

也可以直接执行 `pnpm check`，它会按上述顺序完成类型、Lint、构建、Runtime、公开类型、包归档、Publint 与格式检查。`prepack` 会再次执行同一质量门禁。

adapter 变更还应验证：

- upload、download、普通 HTTP method 的分流；
- Axios transformRequest/transformResponse；
- `validateStatus`；
- AbortSignal 与 CancelToken；
- 进度和响应头回调；
- 不同 uni-app 平台缺少可选任务方法时的行为。

构建插件变更还应验证 Windows/POSIX 路径、查询参数、pnpm node_modules 结构、非小程序不转换，以及缺失兼容包时的错误信息。

## 构建与包检查

正式构建前先清楚确认 `dist/` 是本仓库根目录下的生成目录，不得操作其他路径。

```bash
pnpm build
pnpm test:package
pnpm --config.ignore-scripts=true pack --dry-run
```

发布包至少应包含：

- 根入口、`vite`、`webpack` 子路径的 ESM 与类型声明；
- `dist/index.global.min.js`、Source Map、`unpkg` 与 `jsdelivr` 清单字段；
- LICENSE、双语 README、CHANGELOG、CONTRIBUTING、SECURITY 和 docs；
- 不包含重复 package 目录、私有配置、凭据或无关构建缓存。

包管理器入口为纯 ESM；CDN 入口为单独压缩的 IIFE，并把 Axios 映射到页面提供的全局变量 `axios`。如果构建没有生成 package.json 声明的任何入口，必须先修复构建或清单，禁止带缺失入口发布。

## 版本与更新日志

发布前：

1. 确认版本号符合 SemVer。
2. 把 `CHANGELOG.md` 的 Unreleased 内容整理到带日期的版本章节。
3. 明确列出破坏性变更、运行环境、Fast.NET 协议、adapter、类型和包入口影响。
4. 确认双语文档与最终代码一致。
5. 完成完整验证并检查 npm dry-run 文件列表。

## 发布

发布属于维护者操作，贡献流程不得自动执行。

```bash
pnpm publish --access public
```

必须从仓库根目录执行。发布前需要单独确认 npm 登录账号、目标 registry、版本、Git 状态、构建产物和 dry-run 结果。不得把 npm Token 写入仓库文件或命令日志。
