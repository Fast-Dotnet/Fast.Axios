import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import axios from "axios";
import { Rolldown } from "tsdown";

const workspaceRoot = path.resolve(import.meta.dirname, "../..");
const distRoot = path.join(workspaceRoot, "dist");
const packageJsonPath = path.join(workspaceRoot, "package.json");
const publicExportKeys = [".", "./vite", "./webpack"];

/** 读取根 package.json，并拒绝数组、null 等非清单对象。 */
const readPackageManifest = () => {
	const value = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
	if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError("package.json must contain an object.");
	return value;
};

/** 把包内相对路径解析到仓库根目录，并阻止测试意外访问工作区之外。 */
const resolveWorkspacePath = (relativePath) => {
	const absolutePath = path.resolve(workspaceRoot, ...relativePath.split("/"));
	if (absolutePath !== workspaceRoot && !absolutePath.startsWith(`${workspaceRoot}${path.sep}`)) {
		throw new Error(`Path escapes the workspace: ${relativePath}`);
	}
	return absolutePath;
};

const consumerPath = path.join(workspaceRoot, "__package-consumer__.mjs");

const run = (command, arguments_) => {
	const result = spawnSync(command, arguments_, { cwd: workspaceRoot, encoding: "utf8" });
	if (result.error !== undefined) throw result.error;
	if (result.status !== 0) throw new Error(result.stderr || result.stdout || `Command failed: ${command} (${result.signal ?? result.status})`);
	return result.stdout;
};

const collectFiles = (directory) => {
	const result = [];
	for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
		const absolutePath = path.join(directory, entry.name);
		if (entry.isDirectory()) result.push(...collectFiles(absolutePath));
		else if (entry.isFile()) result.push(absolutePath);
	}
	return result;
};

const verifyBuildArtifacts = () => {
	if (!fs.existsSync(distRoot) || !fs.statSync(distRoot).isDirectory()) throw new Error("tsdown did not create dist/.");
	const manifest = readPackageManifest();
	const exportsMap = manifest["exports"];
	assert.ok(exportsMap !== null && typeof exportsMap === "object" && !Array.isArray(exportsMap));
	assert.deepEqual(Object.keys(exportsMap), publicExportKeys, "package.json public entries do not match the SDK contract.");

	const sourceRoot = path.join(workspaceRoot, "src");
	const sourceModulePaths = collectFiles(sourceRoot)
		.filter((filePath) => filePath.endsWith(".ts"))
		.map((filePath) => path.relative(sourceRoot, filePath).replaceAll(path.sep, "/").replace(/\.ts$/u, ""))
		.sort();
	const files = collectFiles(distRoot);
	const artifacts = files.map((filePath) => path.relative(workspaceRoot, filePath).replaceAll(path.sep, "/")).sort();
	for (const required of [
		"dist/index.mjs",
		"dist/index.d.mts",
		"dist/vite.mjs",
		"dist/vite.d.mts",
		"dist/webpack.mjs",
		"dist/webpack.d.mts",
		"dist/index.global.min.js",
	]) {
		assert.ok(artifacts.includes(required), `required artifact is missing: ${required}`);
	}
	for (const artifact of artifacts) {
		if (/^dist\/index\.global\.min\.js(?:\.map)?$/u.test(artifact)) continue;
		assert.match(artifact, /\.(?:d\.mts|mjs|mjs\.map)$/u, `unexpected build artifact: ${artifact}`);
		const sourcePath = artifact.replace(/^dist\//u, "").replace(/\.(?:d\.mts|mjs)(?:\.map)?$/u, "");
		assert.ok(sourceModulePaths.includes(sourcePath), `stale build artifact has no source module: ${artifact}`);
	}
};

const verifyRelativeImports = () => {
	const importPattern = /(?:\bfrom\s*["']|\bimport\s*\(\s*["'])(\.{1,2}\/[^"']+)["']/gu;
	for (const absolutePath of collectFiles(distRoot)) {
		if (!/\.(?:d\.mts|mjs)$/u.test(absolutePath)) continue;
		const source = fs.readFileSync(absolutePath, "utf8");
		// 声明会保留 TSDoc 示例；移除注释后只校验真正的静态和动态 import。
		const executableSource = source.replace(/\/\*[\s\S]*?\*\//gu, "").replace(/^\s*\/\/.*$/gmu, "");
		for (const match of executableSource.matchAll(importPattern)) {
			const specifier = match[1];
			if (specifier === undefined) continue;
			const dependency = path.resolve(path.dirname(absolutePath), specifier);
			// 仅包含类型的模块没有运行时文件，声明中的 .mjs 对应同名 .d.mts。
			const declarationDependency =
				absolutePath.endsWith(".d.mts") && dependency.endsWith(".mjs") ? dependency.replace(/\.mjs$/u, ".d.mts") : dependency;
			if (
				!declarationDependency.startsWith(`${distRoot}${path.sep}`) ||
				!fs.existsSync(declarationDependency) ||
				!fs.statSync(declarationDependency).isFile()
			) {
				throw new Error(`${path.relative(workspaceRoot, absolutePath)} imports missing file ${specifier}.`);
			}
		}
	}
};

/** 验证运行时 Source Map 内嵌完整源码，不依赖未发布的 src 目录。 */
const verifySourceMaps = () => {
	for (const absolutePath of collectFiles(distRoot)) {
		if (!absolutePath.endsWith(".map")) continue;
		assert.ok(!absolutePath.endsWith(".d.mts.map"), `unexpected declaration map: ${path.relative(workspaceRoot, absolutePath)}`);
		const sourceMap = JSON.parse(fs.readFileSync(absolutePath, "utf8"));
		assert.ok(sourceMap !== null && typeof sourceMap === "object" && !Array.isArray(sourceMap));
		const record = sourceMap;
		assert.ok(Array.isArray(record.sources) && record.sources.length > 0, `${path.relative(workspaceRoot, absolutePath)} has no sources.`);
		assert.equal(record.sources.length, record.sourcesContent?.length, path.relative(workspaceRoot, absolutePath));
		assert.ok(record.sourcesContent.every((source) => typeof source === "string" && source.length > 0));
	}
};

if (fs.existsSync(consumerPath)) throw new Error(`Refusing to overwrite existing fixture: ${consumerPath}`);

try {
	await test("artifacts, relative imports and source maps", async () => {
		verifyBuildArtifacts();
		verifyRelativeImports();
		verifySourceMaps();
	});

	await test("CDN browser entry and external Axios contract", async () => {
		const cdnSource = fs.readFileSync(path.join(distRoot, "index.global.min.js"), "utf8");
		assert.throws(() => vm.runInNewContext(cdnSource, {}), /axios is not defined/u);
		const cdnContext = {
			AbortController,
			Blob,
			FormData,
			URL,
			URLSearchParams,
			axios,
			clearTimeout,
			console,
			setTimeout,
		};
		vm.runInNewContext(cdnSource, cdnContext);
		assert.equal(typeof cdnContext.FastAxios.createFastAxios, "function");
		assert.equal(typeof cdnContext.FastAxios.createUniAppAxiosAdapter, "function");
		assert.equal(typeof cdnContext.FastAxios.axiosUtil.request, "function");
		assert.equal(cdnContext.FastAxios.createFastAxios({ requestCipher: false }, true).requestCipher, false);
		assert.equal(cdnContext.FastAxios.createFastAxios({ locale: "en-US" }, true).t("loading"), "Loading...");
		assert.equal(cdnContext.FastAxios.createFastAxios({ locale: "zh-TW" }, true).errorCode[408], "請求逾時！");
	});

	await test("strict consumer declarations and ESM entry resolution", async () => {
		fs.writeFileSync(
			consumerPath,
			[
				'import axios from "axios";',
				'import { axiosUtil, createFastAxios, createUniAppAxiosAdapter } from "@fast-china/axios";',
				'import vitePlugin from "@fast-china/axios/vite";',
				'import webpackPlugin from "@fast-china/axios/webpack";',
				'if (typeof vitePlugin !== "function" || typeof webpackPlugin !== "function") throw new Error("Build plugin entry failed.");',
				"const isolated = createFastAxios({ requestCipher: false }, true);",
				'if (isolated.requestCipher !== false) throw new Error("Root runtime entry failed.");',
				'isolated.setOptions({ locale: "en-US" });',
				'if (isolated.t("loading") !== "Loading...") throw new Error("Locale runtime entry failed.");',
				"const instance = axios.create({ adapter: createUniAppAxiosAdapter() });",
				'if (typeof instance.upload !== "function") throw new Error("Axios upload augmentation failed.");',
				'if (typeof instance.download !== "function") throw new Error("Axios download augmentation failed.");',
				'/** @type {import("@fast-china/axios").FastAxiosRequestConfig} */',
				'const config = { url: "/users", requestType: "query" };',
				"const verifyPublicTypes = () => {",
				"\t/** @type {Promise<string>} */",
				"\tconst result = axiosUtil.request(config);",
				'\tconst upload = instance.upload("/upload", {}, { filePath: "/tmp/a", name: "file" });',
				'\tconst download = instance.download("/download");',
				"\tvoid result; void upload; void download;",
				"};",
				"void verifyPublicTypes;",
			].join("\n"),
			"utf8"
		);

		const typeScriptPath = path.join(workspaceRoot, "node_modules", "typescript", "bin", "tsc");
		run(process.execPath, [
			typeScriptPath,
			// TypeScript 6 no longer silently ignores a nearby tsconfig when explicit files are supplied.
			"--ignoreConfig",
			"--allowJs",
			"--checkJs",
			"--module",
			"NodeNext",
			"--moduleResolution",
			"NodeNext",
			"--target",
			"ES2022",
			"--strict",
			"--noEmit",
			"--skipLibCheck",
			"false",
			consumerPath,
		]);
		run(process.execPath, [consumerPath]);
		run(process.execPath, [
			"--input-type=module",
			"--eval",
			'delete globalThis.window; delete globalThis.document; delete globalThis.uni; await import("@fast-china/axios");',
		]);
	});

	await test("tree shaking excludes platform and build code", async () => {
		fs.writeFileSync(
			consumerPath,
			'import { createFastAxios } from "@fast-china/axios"; console.log(createFastAxios({ requestCipher: false }, true).requestCipher);\n',
			"utf8"
		);
		const bundle = await Rolldown.rolldown({ external: ["axios"], input: consumerPath, treeshake: true });
		const generated = await bundle.generate({ format: "esm" });
		await bundle.close();
		const code = generated.output
			.filter((item) => item.type === "chunk")
			.map((item) => item.code)
			.join("\n");
		assert.ok(Buffer.byteLength(code) < 24_000, "A FastAxios-only consumer unexpectedly exceeded 24 KiB before minification.");
		assert.doesNotMatch(code, /createUnplugin|downloadFile|uploadFile|UNI_PLATFORM/u, "Plugin or uni-adapter code leaked into the bundle.");
	});

	await test("manifest exports and optional peer contracts", async () => {
		const manifest = readPackageManifest();
		assert.ok(manifest["keywords"].includes("fast"));
		assert.ok(manifest["keywords"].includes("fast-china"));
		assert.ok(manifest["files"].includes("dist"));
		assert.ok(!manifest["files"].includes("src"));
		assert.equal(manifest["main"], "./dist/index.mjs");
		assert.equal(manifest["module"], manifest["main"]);
		assert.equal(manifest["sideEffects"], false);
		assert.equal(typeof manifest["peerDependencies"]?.["axios"], "string", "Axios must be declared as a peer dependency.");
		assert.match(manifest["peerDependencies"]["axios"], /^\^1\./u, "Axios must use the supported v1 peer range.");
		assert.notEqual(manifest["peerDependenciesMeta"]?.["axios"]?.["optional"], true, "Axios must not be an optional peer dependency.");
		assert.equal(manifest["peerDependenciesMeta"]?.["miniprogram-blob"]?.["optional"], true);
		assert.equal(manifest["peerDependenciesMeta"]?.["miniprogram-formdata"]?.["optional"], true);
		assert.equal(manifest["unpkg"], "./dist/index.global.min.js");
		assert.equal(manifest["jsdelivr"], manifest["unpkg"]);
		const exportsMap = manifest["exports"];
		assert.ok(exportsMap !== null && typeof exportsMap === "object");
		for (const value of Object.values(exportsMap)) {
			assert.ok(value !== null && typeof value === "object");
			for (const target of Object.values(value)) {
				assert.equal(typeof target, "string");
				assert.ok(fs.existsSync(resolveWorkspacePath(target.slice(2))));
			}
		}
	});

	await test("npm archive includes complete entries and excludes source/tests", async () => {
		const npmArguments = ["pack", "--dry-run", "--ignore-scripts", "--json"];
		const npmCliPath = path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
		const npmCommand = process.platform === "win32" ? process.execPath : "npm";
		const npmCommandArguments = process.platform === "win32" ? [npmCliPath, ...npmArguments] : npmArguments;
		if (process.platform === "win32" && !fs.existsSync(npmCliPath)) throw new Error(`npm CLI was not found next to Node.js: ${npmCliPath}`);
		const npmResult = spawnSync(npmCommand, npmCommandArguments, {
			cwd: workspaceRoot,
			encoding: "utf8",
			env: { ...process.env, npm_config_cache: path.join(os.tmpdir(), "fast-axios-npm-cache") },
		});
		if (npmResult.error !== undefined) throw npmResult.error;
		if (npmResult.status !== 0) {
			throw new Error(npmResult.stderr || npmResult.stdout || `npm pack --dry-run failed (${npmResult.signal ?? npmResult.status}).`);
		}
		const packReport = JSON.parse(npmResult.stdout);
		assert.ok(Array.isArray(packReport) && packReport.length === 1);
		const report = packReport[0];
		const packedFiles = report.files?.map((file) => file.path ?? "") ?? [];
		for (const required of [
			"dist/index.mjs",
			"dist/index.d.mts",
			"dist/vite.mjs",
			"dist/vite.d.mts",
			"dist/webpack.mjs",
			"dist/webpack.d.mts",
			"dist/index.global.min.js",
			"dist/index.global.min.js.map",
		]) {
			assert.ok(packedFiles.includes(required), `packed archive is missing: ${required}`);
		}
		assert.ok(packedFiles.every((file) => !/^(?:@fast-china|tests)\//u.test(file)));
		assert.ok(
			packedFiles.every((file) => !file.startsWith("src/")),
			"src must not be published."
		);
		assert.ok(packedFiles.includes("Fast.png"));
	});
} finally {
	if (fs.existsSync(consumerPath)) fs.unlinkSync(consumerPath);
}
