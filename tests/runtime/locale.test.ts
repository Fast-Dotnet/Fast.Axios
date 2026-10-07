import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import axios, { AxiosError, AxiosHeaders, CanceledError } from "axios";
import { axiosUtil, createFastAxios } from "../../src/index";
import { replaceGlobal } from "../helpers/environment";
import type { AxiosAdapter, AxiosResponse, InternalAxiosRequestConfig } from "axios";
import type { FastAxiosLocale } from "../../src/index";

const fastAxios = createFastAxios({ requestCipher: false });
const messages: string[] = [];
const response = (config: InternalAxiosRequestConfig, data: unknown): AxiosResponse => ({
	config,
	data,
	headers: new AxiosHeaders(),
	status: 200,
	statusText: "OK",
});

beforeEach(() => {
	fastAxios.setOptions({ locale: "zh-CN", translate: null });
	fastAxios.message.error.use((message) => messages.push(message));
	fastAxios.loading.show.use(() => undefined);
	fastAxios.loading.close.use(() => undefined);
	fastAxios.interceptors.responseError.use(() => undefined);
	messages.length = 0;
});

test("defaults to Chinese and resolves all three languages without sharing overrides", () => {
	const first = createFastAxios(undefined, true);
	const second = createFastAxios({ locale: "en-US" }, true);
	assert.equal(first.errorCode[400], "参数不正确！");
	assert.equal(first.t("loading"), "加载中...");
	assert.equal(second.errorCode[400], "Invalid parameters!");
	first.setOptions({ locale: "zh-TW" });
	assert.equal(first.errorCode[400], "參數不正確！");
	assert.equal(first.t("loading"), "載入中...");
	first.addErrorCode(400, "custom");
	first.errorCode[500] = "";
	first.addErrorCode({ BUSINESS: "business" });
	first.setOptions({ locale: "en-US" });
	assert.equal(first.errorCode[400], "custom");
	assert.equal(first.errorCode[500], "");
	assert.equal(first.errorCode["BUSINESS"], "business");
	assert.equal(second.errorCode[400], "Invalid parameters!");
	assert.equal({ ...second.errorCode }[404], "The requested resource does not exist!");
});

test("reads the application locale and translation at use time with safe fallback", () => {
	let locale = "en-US";
	const container = createFastAxios({ locale: () => locale }, true);
	const errorCodes = container.errorCode;
	assert.equal(errorCodes[408], "Request timed out!");
	locale = "zh-TW";
	assert.equal(errorCodes[408], "請求逾時！");
	locale = "unsupported";
	assert.equal(errorCodes[408], "请求超时！");
	container.setOptions({ translate: (key, language, fallback) => (key === "loading" ? `${language}:${fallback}` : undefined) });
	assert.equal(container.t("loading"), "zh-CN:加载中...");
	assert.equal(errorCodes[408], "请求超时！");
	container.setOptions({ translate: () => "" });
	assert.equal(errorCodes[408], "");
	container.setOptions({ translate: () => null });
	assert.equal(errorCodes[408], "请求超时！");
	container.setOptions({
		locale: () => {
			throw new Error("locale failed");
		},
		translate: () => {
			throw new Error("translation failed");
		},
	});
	assert.equal(errorCodes[408], "请求超时！");
	container.setOptions({ locale: "en-US", translate: null });
	assert.equal(errorCodes[408], "Request timed out!");
});

for (const [locale, loading, network] of [
	["zh-CN", "加载中...", "网关错误，服务不可用，服务器暂时过载或维护！"],
	["zh-TW", "載入中...", "網路錯誤，服務無法使用，伺服器暫時超載或維護中！"],
	["en-US", "Loading...", "Network error. The service is unavailable, overloaded, or under maintenance!"],
] satisfies [FastAxiosLocale, string, string][]) {
	test(`${locale} localizes UI while retaining the rejected AxiosError and cleanup`, async () => {
		fastAxios.setOptions({ locale });
		let original: AxiosError | undefined;
		const events: string[] = [];
		fastAxios.loading.show.use((text) => events.push(text));
		fastAxios.loading.close.use(() => events.push("closed"));
		const adapter: AxiosAdapter = (config) => {
			original = new AxiosError("Network Error", AxiosError.ERR_NETWORK, config);
			return Promise.reject(original);
		};
		await assert.rejects(axiosUtil.request({ url: "/network", requestType: "query", loading: true, adapter }), (error) => error === original);
		assert.equal(original?.message, "Network Error");
		assert.equal(original?.code, AxiosError.ERR_NETWORK);
		assert.deepEqual(messages, [network]);
		assert.deepEqual(events, [loading, "closed"]);
	});
}

test("explicit request text and server message take precedence over translation", async () => {
	fastAxios.setOptions({ locale: "en-US", translate: () => "translated" });
	const loading: string[] = [];
	fastAxios.loading.show.use((text) => loading.push(text));
	await assert.rejects(
		axiosUtil.request({
			url: "/business",
			requestType: "query",
			loading: true,
			loadingText: "",
			adapter: (config) => Promise.resolve(response(config, { code: 400, message: "server message" })),
		}),
		(error) => axios.isAxiosError(error) && error.message === "server message" && error.code === AxiosError.ERR_BAD_RESPONSE
	);
	assert.deepEqual(loading, [""]);
	assert.deepEqual(messages, ["server message"]);
});

test("HTTP and timeout failures retain code, response, config and original message even when translation throws", async () => {
	fastAxios.setOptions({
		locale: "en-US",
		translate: () => {
			throw new Error("translation failed");
		},
	});
	for (const code of [AxiosError.ETIMEDOUT, AxiosError.ECONNABORTED, AxiosError.ERR_BAD_RESPONSE]) {
		let original: AxiosError | undefined;
		await assert.rejects(
			axiosUtil.request({
				url: "/error",
				requestType: "query",
				adapter: (config) => {
					const failedResponse = { ...response(config, {}), status: 503 };
					original = new AxiosError("original", code, config, {}, code === AxiosError.ERR_BAD_RESPONSE ? failedResponse : undefined);
					return Promise.reject(original);
				},
			}),
			(error) => error === original
		);
		assert.equal(original?.code, code);
		assert.equal(original?.message, "original");
		assert.equal(original?.config?.url, "/error");
		if (code === AxiosError.ERR_BAD_RESPONSE) assert.equal(original.response?.status, 503);
	}
	assert.equal(messages.length, 3);
});

test("cancellation and non-Axios rejection bypass translation and remain rejected", async () => {
	fastAxios.setOptions({
		locale: "en-US",
		translate: () => {
			throw new Error("must not translate cancellation");
		},
	});
	const canceled = new CanceledError("application canceled");
	for (const original of [canceled, new Error("application failure")]) {
		await assert.rejects(
			axiosUtil.request({
				url: "/cancel",
				requestType: "query",
				adapter: () => Promise.reject(original),
			}),
			(error) => error === original
		);
	}
	assert.equal(axios.isCancel(canceled), true);
	assert.equal(canceled.code, AxiosError.ERR_CANCELED);
	assert.deepEqual(messages, []);
});

test("uni confirmation localizes defaults, preserves explicit text, and still rejects cancellation", async (context) => {
	const captured: UniNamespace.ShowModalOptions[] = [];
	let confirm = true;
	replaceGlobal(context, "uni", {
		showModal(options: UniNamespace.ShowModalOptions) {
			captured.push(options);
			options.success?.({ confirm, cancel: !confirm });
		},
	});
	const container = createFastAxios({ locale: "en-US" }, true);
	await container.messageBox.confirm({ message: "content" });
	assert.equal(captured[0]?.title, "Notice");
	assert.equal(captured[0]?.confirmText, "OK");
	assert.equal(captured[0]?.cancelText, "Back");
	container.setOptions({ locale: "zh-TW" });
	confirm = false;
	await assert.rejects(container.messageBox.confirm({ message: "content", confirmButtonText: "yes", cancelButtonText: "" }), /使用者取消/u);
	assert.equal(captured[1]?.title, "溫馨提示");
	assert.equal(captured[1]?.confirmText, "yes");
	assert.equal(captured[1]?.cancelText, "");
});

test("built-in modal buttons fit the documented mini-program length limit", () => {
	for (const locale of ["zh-CN", "zh-TW", "en-US"] as const) {
		const container = createFastAxios({ locale }, true);
		for (const key of ["confirmButton", "cancelButton"] as const) {
			const text = container.t(key);
			assert.ok(text.length > 0 && text.length <= 4, `${locale}:${key}`);
		}
	}
});

test("uni requests and localization work without optional browser APIs or Intl", async (context) => {
	for (const key of [
		"window",
		"document",
		"navigator",
		"Intl",
		"crypto",
		"TextEncoder",
		"URL",
		"URLSearchParams",
		"Blob",
		"FormData",
		"AbortController",
	]) {
		replaceGlobal(context, key, undefined);
	}
	let locale = "zh-TW";
	fastAxios.setOptions({ locale: () => locale });
	const loading: string[] = [];
	fastAxios.loading.show.use((text) => loading.push(text));
	let shouldFail = false;
	replaceGlobal(context, "uni", {
		request(options: UniNamespace.RequestOptions) {
			queueMicrotask(() => {
				if (shouldFail) options.fail?.({ errMsg: "request:fail network" });
				else options.success?.({ data: { code: 200, data: "ok" }, statusCode: 200, header: {}, cookies: [] });
			});
			return {
				abort() {
					options.fail?.({ errMsg: "request:fail abort" });
				},
			};
		},
	});
	assert.equal(await axiosUtil.request({ url: "https://example.test/i18n", requestType: "query", loading: true }), "ok");
	assert.deepEqual(loading, ["載入中..."]);
	locale = "en-US";
	shouldFail = true;
	await assert.rejects(
		axiosUtil.request({ url: "https://example.test/i18n", requestType: "query" }),
		(error) => axios.isAxiosError(error) && error.code === AxiosError.ERR_NETWORK && error.message === "request:fail network"
	);
	assert.deepEqual(messages, ["Network error. The service is unavailable, overloaded, or under maintenance!"]);
});
