[简体中文](./README.zh.md) | **English**

<p align="center">
	<img src="./Fast.png" width="128" alt="Fast.Axios Logo" />
</p>

<h1 align="center">Fast.Axios</h1>

<p align="center">
	<a href="https://www.npmjs.com/package/@fast-china/axios"><img src="https://img.shields.io/npm/v/@fast-china/axios?logo=npm" alt="npm version" /></a>
	<a href="https://www.npmjs.com/package/@fast-china/axios"><img src="https://img.shields.io/npm/dm/@fast-china/axios" alt="npm downloads" /></a>
	<a href="./LICENSE"><img src="https://img.shields.io/npm/l/@fast-china/axios" alt="License" /></a>
</p>

An Axios-based request SDK with Fast response handling, extensible handlers and uni-app adapters.

**[Documentation](http://docs.fastdotnet.cn/en-US/frontend/axios/) · [Official website](http://fastdotnet.com)**

## Highlights

- Preserves Axios request and response interceptors, cancellation, parameter serialization, `validateStatus`, and response transforms.
- Handles Fast.NET `ApiResponse` business status, simplified data, messages, cache, Loading, and crypto extension points.
- Routes uni-app `method: "upload" | "download"` requests to `uni.uploadFile` and `uni.downloadFile`.
- Provides `axios.upload()`, `axios.download()`, and typed uni-app platform configuration.
- Provides Vite and Webpack mini-program plugins that replace Axios FormData and Blob platform modules only when needed.
- Publishes pure ESM, declarations, dedicated `vite` and `webpack` subpaths, and a separately minified CDN entry from the repository root.
- Validates runtime behavior, public types, package entries, Source Maps, the CDN global, the npm archive, and Publint before packing.

## Requirements

- Axios `^1.8.1`.
- Node.js `^22.18.0 || ^24.18.0` and pnpm `^11.0.0` for repository development.
- `@dcloudio/types` is recommended for typed uni-app applications.
- uni-app mini-program builds require `miniprogram-formdata` and `miniprogram-blob` in the application project.

## Install

```bash
pnpm add @fast-china/axios axios
```

Install the platform polyfills in a mini-program project:

```bash
pnpm add miniprogram-formdata miniprogram-blob
```

### CDN

The jsDelivr entry uses `dist/index.global.min.js`. Load Axios first, then access this SDK through the `FastAxios` global:

| Resource                                     | jsDelivr                                                                            | unpkg                                                                 |
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

The CDN build is browser-only; uni-app and the Vite/Webpack plugins must use package-manager imports.

## Quick start

Create the global FastAxios container once during application startup, then send requests through `axiosUtil.request()`:

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

By default, `axiosUtil.request()` reads `code`, `success`, `message`, and `data` from the Fast.NET RESTful response and resolves with `data`. Disable `simpleDataFormat` or `restfulResult` on an individual request when the original structure is required.

## Common usage

Connect project feedback through handlers without coupling the SDK to a UI library:

```ts
import { useFastAxios } from "@fast-china/axios";

const fastAxios = useFastAxios();
fastAxios.message.error.use((message) => {
	console.error(message);
});
```

Run this after the preceding `createFastAxios()` initialization. uni-app mini-programs also need the documented build plugin; installing polyfills alone does not complete integration.

## Package entries

| Import or global            | Purpose                                         | Runtime                     |
| --------------------------- | ----------------------------------------------- | --------------------------- |
| `@fast-china/axios`         | FastAxios, `axiosUtil`, and the uni-app adapter | Browser and uni-app         |
| `@fast-china/axios/vite`    | Vite mini-program FormData/Blob plugin          | Node.js build configuration |
| `@fast-china/axios/webpack` | Webpack mini-program FormData/Blob plugin       | Node.js build configuration |
| `FastAxios`                 | Minified IIFE root entry                        | Browser script tag          |

Importing the package does not access `window` or `uni`. Platform APIs are accessed only when the adapter is created, a request runs, or the related feature is called.

## Documentation

- [API reference](http://docs.fastdotnet.cn/en-US/frontend/axios/api/)
- [uni-app adapter](http://docs.fastdotnet.cn/en-US/frontend/axios/uni-app-adapter)
- [Runtime and package contract](http://docs.fastdotnet.cn/en-US/frontend/axios/runtime-contract)
- [Development and release](./docs/DEVELOPMENT_RELEASE.zh-CN.md)
- [Contributing](./CONTRIBUTING.md)
- [Security policy](./SECURITY.md)
- [Changelog](./CHANGELOG.md)

## Development

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm check
```

## Copyright, license and use

Copyright © 2018-Now 小方. This project uses [Apache License 2.0](./LICENSE). Use, modification, distribution and commercial use are permitted subject to its terms.

When redistributing, provide the license, mark modified files and preserve applicable copyright, attribution and supplied NOTICE information as required. This summary does not replace the license or impose additional UI attribution.

Users are responsible for the legal compliance and authorization of their own modifications, deployment, data processing and operations. This reminder is not an additional license condition.

Except as required by applicable law or agreed in writing, the software is provided on an "AS IS" basis. Sections 7 and 8 govern warranty disclaimers and liability limits. Providing the project does not endorse downstream activities or assume users' contractual commitments. This statement does not exclude liability that cannot lawfully be excluded.
