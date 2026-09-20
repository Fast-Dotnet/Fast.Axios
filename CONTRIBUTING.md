# Contributing to Fast.Axios

Thank you for improving Fast.Axios. Contributions should preserve the Fast.NET request contract, Axios lifecycle semantics, and predictable browser and uni-app behavior.

## Requirements

- Node.js `^22.18.0 || ^24.18.0`
- pnpm `^11.0.0` through Corepack
- Git with LF line endings

```bash
corepack enable
pnpm install --frozen-lockfile
```

## Design rules

- Keep `RequestType` synchronized with the Fast.NET OpenAPI conversion.
- Preserve `method: "upload" | "download"` as the established uni adapter file-task contract.
- Keep `axios.upload()` and `axios.download()` available and prevent caller config from overriding their task method.
- Preserve native Axios request and response interceptor behavior, cancellation, transforms, and `validateStatus`.
- Treat Fast project handler `.use()` calls as replacement of one implementation, not as an interceptor queue.
- Do not swallow request, cancellation, HTTP, adapter, or Fast business errors.
- Do not emit duplicate console logs before rejecting an error; logging belongs to application handlers.
- Avoid new automatic retry, token refresh, persistent cache, global state, UI framework, or production dependencies without an approved public contract.
- Keep browser, uni-app, and build-time Node.js code isolated from one another.

## Public API checklist

Every public function, class, interface, type, method, option, and module augmentation must document the applicable items:

- purpose and non-obvious design rationale;
- type parameters, parameters, defaults, units, and accepted values;
- return shape and simplified/full response behavior;
- mutation, replacement, concurrency, cancellation, and cleanup semantics;
- browser, uni-app, mini-program, Vite, and Webpack boundaries;
- thrown or rejected errors;
- a focused example when the signature is insufficient.

Comments should explain intent and constraints. Do not repeat obvious syntax or add comments only to increase volume.

## Documentation

Keep user-visible behavior synchronized across:

- `README.md` and `README.zh.md`;
- [api.en](http://docs.fastdotnet.cn/axios/api.en) and [api](http://docs.fastdotnet.cn/axios/api);
- [runtime-contract](http://docs.fastdotnet.cn/axios/runtime-contract);
- [uni-app-adapter.en](http://docs.fastdotnet.cn/axios/uni-app-adapter.en) and [uni-app-adapter](http://docs.fastdotnet.cn/axios/uni-app-adapter);
- `CHANGELOG.md` and public API TSDoc.

English and Chinese documentation must describe the same API, defaults, constraints, and examples.

## Validation

Run the narrowest relevant command while developing, then run the complete repository checks before submitting:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm format:check
git diff --check
```

`pnpm check` runs the complete quality gate, and `prepack` repeats it before a package archive is created.

Adapter changes must cover upload, download, ordinary methods, response transforms, status validation, cancellation, and relevant platform callbacks. Build-plugin changes must cover mini-program activation, path normalization, dependency resolution, and inactive-platform behavior.

For package-entry or publishing changes, also build and inspect the archive:

```bash
pnpm build
pnpm test:package
pnpm --config.ignore-scripts=true pack --dry-run
```

Do not weaken type checks, lint rules, assertions, or documented contracts to make validation pass.

## Dependencies

Before changing a dependency:

1. verify Node.js, Axios, unplugin, and platform requirements;
2. review release notes and security advisories;
3. update only the root manifest and pnpm lock file;
4. run type, lint, build, adapter, plugin, package, and dry-run checks;
5. avoid unrelated upgrades in the same pull request.

The repository root is the only package source. Do not recreate a nested publication directory or duplicate package.json.

## Pull requests

- Keep the diff focused and avoid unrelated repository-wide formatting.
- Add or update deterministic regression coverage for behavior changes when test infrastructure exists.
- Add a dated changelog entry only while preparing a release; otherwise update the Unreleased section.
- Describe API, Fast.NET protocol, adapter, runtime, package-entry, type, security, and size impact.
- Never include credentials, access tokens, private endpoints, production logs, file paths containing private data, or generated package archives.
- Do not publish, tag, push, or deploy from a contribution workflow.

## Security reports

Do not open a public issue for a suspected vulnerability. Follow [SECURITY.md](./SECURITY.md).
