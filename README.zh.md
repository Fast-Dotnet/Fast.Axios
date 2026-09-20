<p align="left">
	<strong>简体中文</strong> | <a href="./README.md">English</a>
</p>

<p align="center">
	<img src="./Fast.png" alt="logo" width="160" />
</p>

# @fast-china/axios

**[使用文档](http://docs.fastdotnet.cn/axios/) · [官方网站](http://fastdotnet.com)**

面向 Fast 项目、浏览器与 uni-app 的类型化 Axios 请求库，内置 Fast.NET 响应处理、uni-app adapter 和小程序构建插件。

[![npm 版本](https://img.shields.io/npm/v/@fast-china/axios?color=orange)](https://www.npmjs.com/package/@fast-china/axios) [![node](https://img.shields.io/badge/node-%5E22.18%20%7C%7C%20%5E24.18-brightgreen)](https://nodejs.org/) [![axios](https://img.shields.io/badge/axios-%5E1.8.1-5a29e4)](https://axios-http.com/) [![开源协议](https://img.shields.io/npm/l/@fast-china/axios)](./LICENSE)

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

`unpkg` 和 `jsdelivr` 字段均指向 `dist/index.global.min.js`。页面必须先加载 Axios，再通过全局变量 `FastAxios` 使用本 SDK：

```html
<script src="https://cdn.jsdelivr.net/npm/axios@1.8.1/dist/axios.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@fast-china/axios@2/dist/index.global.min.js"></script>
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

对应的 unpkg 地址为 `https://unpkg.com/@fast-china/axios@2/dist/index.global.min.js`。CDN 产物仅用于浏览器；uni-app 和 Vite/Webpack 插件必须使用包管理器导入。

## 快速开始

应用启动时先创建全局 FastAxios 容器，再通过 `axiosUtil.request()` 发起请求：

```ts
import { axiosUtil, createFastAxios } from "@fast-china/axios";

const fastAxios = createFastAxios({
	baseUrl: "https://api.example.com",
	timeout: 30_000,
	headers: {
		Authorization: "Bearer <token>",
	},
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

## 项目处理器

[完整配置与示例](http://docs.fastdotnet.cn/axios/guide)

## uni-app adapter

[完整配置与示例](http://docs.fastdotnet.cn/axios/guide)

## 小程序构建插件

[完整配置与示例](http://docs.fastdotnet.cn/axios/guide)

## 包入口

| 导入路径或全局变量          | 用途                                    | 运行环境           |
| --------------------------- | --------------------------------------- | ------------------ |
| `@fast-china/axios`         | FastAxios、`axiosUtil`、uni-app adapter | 浏览器、uni-app    |
| `@fast-china/axios/vite`    | Vite 小程序 FormData/Blob 插件          | Node.js 构建配置   |
| `@fast-china/axios/webpack` | Webpack 小程序 FormData/Blob 插件       | Node.js 构建配置   |
| `FastAxios`                 | 压缩后的 IIFE 根入口                    | 浏览器 script 标签 |

包导入阶段不会访问 `window` 或 `uni`。平台 API 只在创建 adapter、执行请求或调用对应功能时使用。

## 文档

- [API 文档](http://docs.fastdotnet.cn/axios/api)
- [uni-app adapter](http://docs.fastdotnet.cn/axios/uni-app-adapter)
- [运行时与包契约](http://docs.fastdotnet.cn/axios/runtime-contract)
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

## 许可证

[Apache-2.0](./LICENSE)
