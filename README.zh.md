**简体中文** | [English](./README.md)

<p align="center">
	<img src="./Fast.png" width="128" alt="Fast.Axios Logo" />
</p>

<h1 align="center">Fast.Axios</h1>

<p align="center">
	<a href="https://www.npmjs.com/package/@fast-china/axios"><img src="https://img.shields.io/npm/v/@fast-china/axios?logo=npm" alt="npm version" /></a>
	<a href="https://www.npmjs.com/package/@fast-china/axios"><img src="https://img.shields.io/npm/dm/@fast-china/axios" alt="npm downloads" /></a>
	<a href="./LICENSE"><img src="https://img.shields.io/npm/l/@fast-china/axios" alt="License" /></a>
</p>

基于 Axios 的请求 SDK，提供 Fast 响应处理、扩展处理器及 uni-app 网络适配。

**[使用文档](http://docs.fastdotnet.cn/zh-CN/frontend/axios/) · [官方网站](http://fastdotnet.com)**

## 特性

- 保留 Axios 请求、响应拦截器、取消、参数序列化、`validateStatus` 和响应转换语义。
- 按 Fast.NET `ApiResponse` 约定处理业务状态、简洁数据、错误提示、缓存、Loading 和加解密扩展点。
- 在 uni-app 中把 `method: "upload" | "download"` 分流到 `uni.uploadFile` 和 `uni.downloadFile`。
- 提供 `axios.upload()`、`axios.download()` 以及完整的 TypeScript 平台配置扩展。
- 提供 Vite 与 Webpack 小程序插件，按需替换 Axios 的 FormData 和 Blob 平台模块。
- 从仓库根目录发布纯 ESM、类型声明、独立的 `vite`、`webpack` 子路径和单独压缩的 CDN 入口。
- 打包前验证运行时、公开类型、包入口、Source Map、CDN 全局变量、npm 归档和 Publint。

## 环境要求

- Axios `^1.8.1`。
- 开发环境使用 Node.js `^22.18.0 || ^24.18.0` 和 pnpm `^11.0.0`。
- uni-app 类型项目建议安装 `@dcloudio/types`。
- uni-app 小程序构建需要在应用项目中安装 `miniprogram-formdata` 和 `miniprogram-blob`。

## 安装

```bash
pnpm add @fast-china/axios axios
```

小程序项目另外安装平台兼容包：

```bash
pnpm add miniprogram-formdata miniprogram-blob
```

### CDN

jsDelivr 入口为 `dist/index.global.min.js`。页面必须先加载 Axios，再通过全局变量 `FastAxios` 使用本 SDK：

| 资源                                         | jsDelivr                                                                            | unpkg                                                                 |
| -------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `axios@1.8.1/dist/axios.min.js`              | [jsDelivr](https://cdn.jsdelivr.net/npm/axios@1.8.1/dist/axios.min.js)              | [unpkg](https://unpkg.com/axios@1.8.1/dist/axios.min.js)              |
| `@fast-china/axios/dist/index.global.min.js` | [jsDelivr](https://cdn.jsdelivr.net/npm/@fast-china/axios/dist/index.global.min.js) | [unpkg](https://unpkg.com/@fast-china/axios/dist/index.global.min.js) |

```html
<script src="https://cdn.jsdelivr.net/npm/axios@1.8.1/dist/axios.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@fast-china/axios/dist/index.global.min.js"></script>
<script>
	FastAxios.createFastAxios({
		baseUrl: "https://api.example.com",
		requestCipher: false,
	});

	FastAxios.axiosUtil.request({
		url: "/users/1",
		method: "get",
		requestType: "query",
	});
</script>
```

CDN 产物仅用于浏览器；uni-app 和 Vite/Webpack 插件必须使用包管理器导入。

## 快速开始

应用启动时先创建全局 FastAxios 容器，再通过 `axiosUtil.request()` 发起请求：

```ts
import { axiosUtil, createFastAxios } from "@fast-china/axios";

createFastAxios({
	baseUrl: "https://api.example.com",
	timeout: 30_000,
	requestCipher: false,
});

interface User {
	id: number;
	name: string;
}

const user = await axiosUtil.request<User>({
	url: "/users/1",
	method: "get",
	requestType: "query",
});
```

`axiosUtil.request()` 默认按 Fast.NET RESTful 响应读取 `code`、`success`、`message` 和 `data`，成功时直接返回 `data`。如需原始结构，可通过单次请求选项关闭 `simpleDataFormat` 或 `restfulResult`。

## 常见用法

通过处理器接入项目自己的提示组件，不让 SDK 依赖 UI 库：

```ts
import { useFastAxios } from "@fast-china/axios";

const fastAxios = useFastAxios();
fastAxios.message.error.use((message) => {
	console.error(message);
});
```

该示例在前面的 `createFastAxios()` 初始化之后执行。uni-app 小程序还需单独配置公开构建插件；仅安装 polyfill 不等于完成接入。

## 包入口

| 导入路径或全局变量          | 用途                                    | 运行环境           |
| --------------------------- | --------------------------------------- | ------------------ |
| `@fast-china/axios`         | FastAxios、`axiosUtil`、uni-app adapter | 浏览器、uni-app    |
| `@fast-china/axios/vite`    | Vite 小程序 FormData/Blob 插件          | Node.js 构建配置   |
| `@fast-china/axios/webpack` | Webpack 小程序 FormData/Blob 插件       | Node.js 构建配置   |
| `FastAxios`                 | 压缩后的 IIFE 根入口                    | 浏览器 script 标签 |

包导入阶段不会访问 `window` 或 `uni`。平台 API 只在创建 adapter、执行请求或调用对应功能时使用。

## 文档

- [API 文档](http://docs.fastdotnet.cn/zh-CN/frontend/axios/api/)
- [uni-app adapter](http://docs.fastdotnet.cn/zh-CN/frontend/axios/uni-app-adapter)
- [运行时与包契约](http://docs.fastdotnet.cn/zh-CN/frontend/axios/runtime-contract)
- [开发与发布](./docs/DEVELOPMENT_RELEASE.zh-CN.md)
- [贡献指南](./CONTRIBUTING.md)
- [安全策略](./SECURITY.md)
- [更新日志](./CHANGELOG.md)

## 开发

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm check
```

## 版权、许可证与使用声明

版权所有 © 2018-Now 小方。本项目依据 [Apache License 2.0](./LICENSE) 开源；在遵守许可证的前提下，可以使用、修改和分发本软件，包括商业使用。

再分发时，应按许可证要求提供许可证副本、对修改的文件作出显著说明，并保留适用的版权和归属声明；包含需要保留的 NOTICE 信息时一并处理。本说明不替代正式许可证，也不额外要求在产品界面展示作者或项目标识。

使用者应就自身使用、二次开发、部署、数据处理及运营活动遵守适用法律和第三方合法权益，自行取得依法需要的授权。上述内容为合规提醒，不构成附加许可条件。

除适用法律另有规定或另有书面约定外，本软件按“原样”提供；保证排除与责任限制以许可证第 7、8 条为准。提供本项目不代表原作者为使用者的二次开发和运营活动背书，也不当然承担其对第三方作出的合同承诺。本说明不排除依法不得排除的责任。
