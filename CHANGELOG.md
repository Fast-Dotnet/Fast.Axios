# Changelog

All notable changes to this project are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and releases should follow [Semantic Versioning](https://semver.org/).

## [2.0.6] - 2026-10-07

### Fixed

- Enable request caching without Web Crypto or TextEncoder using bounded opaque identity keys, retaining the default in-memory cache and credential isolation.
- Copy uni-app request headers before applying Basic Auth or removing upload Content-Type, preserving the original Axios config.

### Changed

- Reuse Axios native types for headers, adapters, and cancellation while preserving platform-neutral public uni-app types.
- Reorganize tests by configuration, request pipeline, cache identity, uni-app adapter, build plugins, public types, and package consumers; consolidate duplicate cases and expand contract coverage.

## [2.0.5] - 2026-09-22

### Fixed

- Preserve URLSearchParams and repeated keys; skip automatic duplicate cancellation for opaque bodies unless an explicit duplicateKey is provided.
- Await request/response/error hooks, preserve null responses and honor silent network/file failures.
- Require an explicit cache namespace, hash final request identity, invalidate late writes on clear/context changes, and bound the default cache to 256 entries for five minutes. This changes cache opt-in behavior.
- Close Loading only after the same request successfully called show, preventing a request-hook failure before show from closing another in-flight request's Loading.
- Include per-request `baseURL` overrides in cache keys.
- Release temporary download elements and object URLs when browser download triggering fails.
- Treat navigator as offline only when `onLine` is explicitly false.

### Documentation and Tooling

- Correct localized Fast.Docs links and retain minimal README examples.
- Align public-contract comments and agent guidance.
- Keep ESLint and Prettier skill-file ignores separate and add regression checks.

## [2.0.4] - 2026-09-12

### Changed

- Expanded the applicable JavaScript, TypeScript, import, RegExp, JSON, Markdown, sorting, and Prettier rules from Fast.ESLint.Config 2.1.8 directly in the repository's single `eslint.config.mjs`.
- Retained only the Node, browser, and uni-app environment scopes required by this SDK, without a shared-config package dependency or framework rule groups.

## [2.0.3] - 2026-09-11

### Changed

- Removed SDK-specific ESLint rule suppressions and updated the source and tests to pass the active strict rules without weakening the shared checks.
- Refined chainable container typing and normalized request, MessageBox, and uni-app adapter Promise implementations while preserving the documented public API.

## [2.0.2] - 2026-09-11

### Changed

- Updated `unplugin` to 3.3.0 and refreshed compatible development dependencies while preserving the existing Vite, Webpack, and uni-app public contracts.
- Strengthened the self-contained ESLint configuration with the latest shared safety rules and SDK-specific TypeScript checks.

## [2.0.1] - 2026-08-26

### Changed

- Synchronized the self-contained ESLint Flat Config with the applicable JavaScript, TypeScript, import, regular-expression, JSON, and Markdown rules from Fast.ESLint.Config, including the source rule comments and project-specific scopes without introducing a cross-package configuration dependency.
- Updated compatible runtime and development dependencies, the pnpm lockfile, and documented VS Code recommendations while retaining the Node.js 22.18/24.18 compatibility contract.

## [2.0.0] - 2026-08-11

### Added

- Added a typed Fast.NET request configuration with synchronized `RequestType` values and explicit RESTful response handling.
- Added a uni-app Axios adapter for `uni.request`, `uni.uploadFile`, and `uni.downloadFile`, including progress, response headers, cancellation, and Axios status handling.
- Added stable `axios.upload()` and `axios.download()` convenience methods while preserving the established `method: "upload" | "download"` task contract.
- Added Vite and Webpack mini-program entries that replace Axios FormData and Blob platform modules with application-owned polyfills.
- Added an Axios-external browser IIFE exposed as `FastAxios`, with `unpkg` and `jsdelivr` package entries.
- Added Runtime, public-type, CDN, Source Map, npm archive, package-consumer, and Publint contract tests.
- Added synchronized English and Chinese README, API and adapter references, runtime contract, contribution guidance, security policy, and development/release instructions.

### Changed

- Moved package publishing to the repository root with one package.json and one root `dist/` directory.
- Reworked duplicate-request cancellation, cache keys, falsy cache values, file responses, error extraction, custom handlers, crypto defaults, and Loading cleanup.
- Kept Axios's native request and response interceptor structure while allowing the Fast response pipeline to return simplified business data.
- Removed duplicate request-core console output before rejected errors; applications retain logging control through Message and global error handlers.
- Standardized TypeScript 6, tsdown, ESLint, pnpm 11, and Node.js 22/24 development contracts.
- Standardized package-manager output as pure ESM with matching declarations for the root, Vite, and Webpack entries.
- Removed the public declaration dependency on uni-app globals while retaining typed adapter platform options.

### Removed

- Removed the duplicated nested publication package and legacy multi-tool build scripts.
- Removed the temporary `uniTask` routing design; the original Fast method-based upload/download contract remains authoritative.

[2.0.6]: https://gitee.com/FastDotnet/fast.axios/compare/v2.0.5...v2.0.6
[2.0.5]: https://gitee.com/FastDotnet/fast.axios/compare/v2.0.4...v2.0.5
[2.0.4]: https://gitee.com/FastDotnet/fast.axios/compare/v2.0.3...v2.0.4
[2.0.3]: https://gitee.com/FastDotnet/fast.axios/compare/v2.0.2...v2.0.3
[2.0.2]: https://gitee.com/FastDotnet/fast.axios/compare/v2.0.1...v2.0.2
[2.0.1]: https://gitee.com/FastDotnet/fast.axios/compare/v2.0.0...v2.0.1
[2.0.0]: https://gitee.com/FastDotnet/fast.axios/releases/tag/v2.0.0
