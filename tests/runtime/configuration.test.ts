import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AxiosHeaders } from "axios";
import { createFastAxios, useFastAxios } from "../../src/axios/fastAxios";
import { replaceGlobal } from "../helpers/environment";
import type { AxiosResponse, InternalAxiosRequestConfig } from "axios";

describe("FastAxios configuration container", () => {
	it("keeps isolated instances outside the global singleton", () => {
		assert.throws(() => useFastAxios(), /createFastAxios/u);

		const isolated = createFastAxios(
			{
				baseUrl: "https://isolated.example.com",
				headers: { Authorization: "Bearer isolated" },
				requestCipher: false,
				timeout: 0,
			},
			true
		);

		assert.equal(isolated.baseUrl, "https://isolated.example.com");
		assert.equal(isolated.timeout, 0);
		assert.equal(isolated.requestCipher, false);
		assert.equal(isolated.headers["Authorization"], "Bearer isolated");
		assert.throws(() => useFastAxios(), /createFastAxios/u);
	});

	it("merges singleton options without replacing registered handlers", () => {
		const fastAxios = createFastAxios({ baseUrl: "https://api.example.com", headers: { A: "1" } });
		const messages: string[] = [];
		fastAxios.message.error.use((message) => messages.push(message));

		const updated = createFastAxios({ baseUrl: "", headers: { B: "2" }, requestCipher: false, timeout: 15_000 });
		updated.message.error("failed");

		assert.equal(updated, fastAxios);
		assert.equal(useFastAxios(), fastAxios);
		assert.equal(updated.baseUrl, "");
		assert.equal(updated.timeout, 15_000);
		assert.equal(updated.requestCipher, false);
		assert.deepEqual(updated.headers, { A: "1", B: "2" });
		assert.deepEqual(messages, ["failed"]);
	});

	it("replaces loading handlers through stable public proxies", () => {
		const fastAxios = createFastAxios(undefined, true);
		const loadingEvents: string[] = [];
		fastAxios.loading.show.use((text) => loadingEvents.push(`show:${text}`));
		fastAxios.loading.close.use(() => loadingEvents.push("close"));

		fastAxios.loading.show("Loading");
		fastAxios.loading.close({});
		assert.deepEqual(loadingEvents, ["show:Loading", "close"]);
	});

	it("keeps the default crypto handlers as explicit no-op boundaries", () => {
		const fastAxios = createFastAxios(undefined, true);
		const config = {
			headers: new AxiosHeaders(),
			method: "get",
			url: "/users",
		} satisfies InternalAxiosRequestConfig;
		const response = {
			config,
			data: { code: 200, data: { id: 1 } },
			headers: new AxiosHeaders(),
			status: 200,
			statusText: "OK",
		} satisfies AxiosResponse;

		assert.doesNotThrow(() => fastAxios.crypto.encrypt(config, Date.now()));
		assert.equal(fastAxios.crypto.decrypt(response, { requestType: "query" }), response.data);
	});

	it("supports single and batch error-code registration", () => {
		const fastAxios = createFastAxios(undefined, true);
		assert.equal(fastAxios.addErrorCode(40101, "登录失效"), fastAxios);
		assert.equal(fastAxios.addErrorCode({ 40102: "账号停用", CUSTOM: "自定义错误" }), fastAxios);
		assert.equal(fastAxios.errorCode[40101], "登录失效");
		assert.equal(fastAxios.errorCode[40102], "账号停用");
		assert.equal(fastAxios.errorCode["CUSTOM"], "自定义错误");
		assert.throws(() => Reflect.apply(fastAxios.addErrorCode.bind(fastAxios), fastAxios, [40103]), TypeError);
	});
});

describe("default and replaceable handlers", () => {
	it("provides isolated defaults and keeps independent manager state", () => {
		const first = createFastAxios(undefined, true);
		const second = createFastAxios(undefined, true);
		assert.equal(first.baseUrl, "");
		assert.equal(first.timeout, 60000);
		assert.equal(first.requestCipher, true);
		assert.deepEqual(first.headers, {});
		assert.doesNotThrow(() => {
			first.loading.show("loading");
			first.loading.close({});
		});
		first.addErrorCode("CUSTOM", "first only");
		first.cache.set("key", 0);
		assert.equal(second.errorCode["CUSTOM"], undefined);
		assert.equal(second.cache.get("key"), null);
	});

	it("routes default message levels to their console boundary", (context) => {
		const messages: string[] = [];
		for (const method of ["log", "warn", "error"] as const) {
			context.mock.method(console, method, (message: string) => {
				messages.push(`${method}:${message}`);
			});
		}
		const container = createFastAxios(undefined, true);
		container.message.success("success");
		container.message.info("info");
		container.message.warning("warning");
		container.message.error("error");
		assert.deepEqual(messages, ["log:[Fast.Axios] success", "log:[Fast.Axios] info", "warn:[Fast.Axios] warning", "error:[Fast.Axios] error"]);
		const retained = container.message.error;
		container.message.error.use((message) => {
			messages.push(message);
		});
		retained("replacement");
		assert.equal(messages.at(-1), "replacement");
	});

	it("browser confirmation resolves acceptance and rejects cancellation or unsupported environments", async (context) => {
		replaceGlobal(context, "uni", undefined);
		let accepted = true;
		replaceGlobal(context, "window", { confirm: () => accepted });
		const box = createFastAxios(undefined, true).messageBox;
		await box.confirm({ message: "continue" });
		accepted = false;
		await assert.rejects(box.confirm({ message: "continue" }));
		replaceGlobal(context, "window", undefined);
		await assert.rejects(box.confirm({ message: "continue" }), /window.confirm/u);
	});

	it("uni confirmation forwards options and distinguishes cancel from platform failure", async (context) => {
		let outcome: "confirm" | "cancel" | "fail" = "confirm";
		const captured: UniNamespace.ShowModalOptions[] = [];
		replaceGlobal(context, "uni", {
			showModal(options: UniNamespace.ShowModalOptions) {
				captured.push(options);
				if (outcome === "fail") options.fail?.({ errMsg: "mock failure" });
				else options.success?.({ confirm: outcome === "confirm", cancel: outcome === "cancel" });
			},
		});
		const box = createFastAxios(undefined, true).messageBox;
		await box.confirm({ message: "continue", confirmButtonText: "yes", cancelButtonText: "no" });
		assert.equal(captured[0]?.content, "continue");
		assert.equal(captured[0]?.confirmText, "yes");
		assert.equal(captured[0]?.cancelText, "no");
		outcome = "cancel";
		await assert.rejects(box.confirm({ message: "continue" }));
		outcome = "fail";
		await assert.rejects(box.confirm({ message: "continue" }), /mock failure/u);
		const retained = box.confirm;
		box.confirm.use(() => Promise.resolve());
		await retained({ message: "custom" });
	});
});
