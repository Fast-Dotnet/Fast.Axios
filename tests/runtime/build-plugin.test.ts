import assert from "node:assert/strict";
import { mkdtempSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { uniAppAxiosUnplugin } from "../../src/unplugin/index";
const originalPlatform = process.env["UNI_PLATFORM"];

afterEach(() => {
	if (originalPlatform === undefined) delete process.env["UNI_PLATFORM"];
	else process.env["UNI_PLATFORM"] = originalPlatform;
});

/** 读取 raw 插件，直接验证跨 Vite/Webpack 共享的转换核心。 */
const createRawPlugin = () => {
	const plugin = uniAppAxiosUnplugin.raw(undefined, { framework: "vite" });
	assert.ok(!Array.isArray(plugin));
	assert.ok(plugin.transform && typeof plugin.transform !== "function");
	const unsupported = () => {
		throw new Error("Unexpected build context access");
	};
	const context = {
		addWatchFile: unsupported,
		emitFile: unsupported,
		getWatchFiles: unsupported,
		parse: unsupported,
		error: unsupported,
		warn: unsupported,
	};
	const vite: unknown = plugin.vite;
	assert.ok(vite && typeof vite === "object");
	const config: unknown = Reflect.get(vite, "config");
	assert.ok(typeof config === "function");
	return {
		transform: { ...plugin.transform, handler: plugin.transform.handler.bind(context) },
		config: () => Reflect.apply(config, {}, []) as unknown,
	};
};

describe("mini-program build plugin", () => {
	it("leaves non-mini-program builds unchanged", async () => {
		process.env["UNI_PLATFORM"] = "h5";
		const plugin = createRawPlugin();

		const result = await plugin.transform.handler("export default window.FormData;", "/node_modules/form-data/lib/browser.js");

		assert.equal(result, undefined);
		assert.equal(plugin.config(), undefined);
	});

	it("rewrites the form-data browser global only for mini-program builds", async () => {
		process.env["UNI_PLATFORM"] = "mp-weixin";
		const plugin = createRawPlugin();

		const result = await plugin.transform.handler(
			"module.exports = typeof self == 'object' ? self.FormData : window.FormData;",
			"C:\\project\\node_modules\\form-data\\lib\\browser.js?commonjs-proxy"
		);

		assert.ok(result && typeof result === "object");
		assert.match(result.code, /globalThis\.FormData/u);
		assert.doesNotMatch(result.code, /window\.FormData/u);
	});

	it("replaces Axios platform modules and exposes the Vite optimizeDeps rule", async () => {
		process.env["UNI_PLATFORM"] = "mp-alipay";
		const plugin = createRawPlugin();

		const formDataResult = await plugin.transform.handler(
			"export default FormData;",
			"/workspace/node_modules/.pnpm/axios@1.8.1/node_modules/axios/lib/platform/browser/classes/FormData.js"
		);
		const blobResult = await plugin.transform.handler(
			"export default Blob;",
			"/workspace/node_modules/axios/lib/platform/browser/classes/Blob.js?import"
		);

		assert.ok(formDataResult && typeof formDataResult === "object");
		assert.match(formDataResult.code, /from "miniprogram-formdata"/u);
		assert.ok(blobResult && typeof blobResult === "object");
		assert.match(blobResult.code, /from "miniprogram-blob"/u);
		assert.deepEqual(plugin.config(), { optimizeDeps: { exclude: ["axios"] } });
	});
});

it("ignores unrelated modules and form-data code without a browser global", async () => {
	process.env["UNI_PLATFORM"] = "mp-weixin";
	const plugin = createRawPlugin();
	assert.equal(await plugin.transform.handler("export default Blob", "/src/Blob.js"), undefined);
	assert.equal(await plugin.transform.handler("module.exports = globalThis.FormData", "/node_modules/form-data/lib/browser.js"), undefined);
});

it("checks optional polyfills from the consumer project only when their modules are transformed", async () => {
	const originalDirectory = process.cwd();
	const directory = mkdtempSync(join(tmpdir(), "fast-axios-plugin-"));
	try {
		process.chdir(directory);
		process.env["UNI_PLATFORM"] = "mp-weixin";
		const plugin = createRawPlugin();
		assert.equal(await plugin.transform.handler("export default value", "/src/user.js"), undefined);
		for (const [feature, dependency] of [
			["Blob", "miniprogram-blob"],
			["FormData", "miniprogram-formdata"],
		]) {
			assert.throws(
				() => plugin.transform.handler("", `/node_modules/axios/lib/platform/browser/classes/${feature}.js`),
				(error: unknown) => {
					assert.ok(error instanceof Error);
					assert.ok(error.message.includes(dependency ?? ""));
					assert.ok(error.cause instanceof Error);
					return true;
				}
			);
		}
	} finally {
		process.chdir(originalDirectory);
		rmdirSync(directory);
	}
});
