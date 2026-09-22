import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { AxiosError, AxiosHeaders } from "axios";
import { axiosUtil, createFastAxios } from "../src/axios/index";
import type { TestContext } from "node:test";
import type { AxiosAdapter, AxiosResponse, InternalAxiosRequestConfig } from "axios";

const response = (config: InternalAxiosRequestConfig, data: unknown = "ok"): AxiosResponse => ({
	config,
	data: { code: 200, success: true, data },
	headers: new AxiosHeaders(),
	status: 200,
	statusText: "OK",
});

const success: AxiosAdapter = (config) => Promise.resolve(response(config));
const fastAxios = createFastAxios({ baseUrl: "https://api.example.test", requestCipher: false });

beforeEach(() => {
	fastAxios.cache.namespace = "test-user";
	fastAxios.cache.clear();
	fastAxios.interceptors.request.use(() => undefined);
	fastAxios.interceptors.response.use(() => undefined);
	fastAxios.interceptors.responseError.use(() => undefined);
	fastAxios.loading.show.use(() => undefined);
	fastAxios.loading.close.use(() => undefined);
	fastAxios.message.error.use(() => undefined);
	fastAxios.crypto.encrypt.use(() => undefined);
	fastAxios.crypto.decrypt.use((response) => response.data);
	const cache = new Map<string, unknown>();
	fastAxios.cache.get.use((key) => cache.get(key));
	fastAxios.cache.set.use((key, value) => {
		cache.set(key, value);
	});
});

test("a request without Loading never closes another request's Loading", async () => {
	let closes = 0;
	fastAxios.loading.close.use(() => {
		closes++;
	});
	await axiosUtil.request({ url: "/no-loading", requestType: "query", adapter: success });
	assert.equal(closes, 0);
});

test("a request handler failure before show cannot close an active concurrent request", async () => {
	const entered = Promise.withResolvers<void>();
	const release = Promise.withResolvers<void>();
	const failure = new Error("request handler failed");
	let active = 0;
	fastAxios.loading.show.use(() => {
		active++;
	});
	fastAxios.loading.close.use(() => {
		active--;
	});
	fastAxios.interceptors.request.use((config) => {
		if (config.url === "/failed") throw failure;
	});
	const running = axiosUtil.request({
		url: "/running",
		requestType: "query",
		loading: true,
		adapter: async (config) => {
			entered.resolve();
			await release.promise;
			return response(config);
		},
	});
	try {
		await entered.promise;
		assert.equal(active, 1);
		await assert.rejects(
			axiosUtil.request({ url: "/failed", requestType: "query", loading: true, adapter: success }),
			(error) => error === failure
		);
		assert.equal(active, 1);
	} finally {
		release.resolve();
		await running;
	}
	assert.equal(active, 0);
});

test("failure after show closes Loading exactly once", async () => {
	const events: string[] = [];
	const failure = new Error("encryption failed");
	fastAxios.loading.show.use(() => {
		events.push("show");
	});
	fastAxios.loading.close.use(() => {
		events.push("close");
	});
	fastAxios.crypto.encrypt.use(() => {
		throw failure;
	});
	await assert.rejects(
		axiosUtil.request({ url: "/encrypt", requestType: "query", loading: true, requestCipher: true, adapter: success }),
		(error) => error === failure
	);
	assert.deepEqual(events, ["show", "close"]);
});

test("cache keys respect each request's explicit baseURL", async () => {
	let calls = 0;
	const adapter: AxiosAdapter = (config) => {
		calls++;
		return Promise.resolve(response(config, config.baseURL));
	};
	const first = {
		url: "/same-resource",
		requestType: "query" as const,
		method: "get",
		cache: true,
		adapter,
		baseURL: "https://first.example.test",
	};
	const second = { ...first, baseURL: "https://second.example.test" };
	assert.equal(await axiosUtil.request(first), first.baseURL);
	assert.equal(await axiosUtil.request(second), second.baseURL);
	assert.equal(await axiosUtil.request(first), first.baseURL);
	assert.equal(calls, 2);
});

function replaceGlobal(t: TestContext, key: string, value: unknown): void {
	const descriptor = Object.getOwnPropertyDescriptor(globalThis, key);
	Object.defineProperty(globalThis, key, { configurable: true, value });
	t.after(() => {
		if (descriptor) Object.defineProperty(globalThis, key, descriptor);
		else Reflect.deleteProperty(globalThis, key);
	});
}

test("a partial navigator object does not falsely report an offline browser", async (t) => {
	replaceGlobal(t, "navigator", {});
	const failure = new Error("mapped error");
	fastAxios.interceptors.responseError.use(() => failure);
	await assert.rejects(
		axiosUtil.request({
			url: "/network",
			requestType: "query",
			adapter: (config) => {
				return Promise.reject(new AxiosError("network failed", AxiosError.ERR_NETWORK, config));
			},
		}),
		(error) => error === failure
	);
});

test("failed browser downloads always release their element and object URL", (t) => {
	const failure = new Error("click failed");
	const events: string[] = [];
	const anchor = {
		style: {},
		click: () => {
			throw failure;
		},
		remove: () => {
			events.push("remove");
		},
	};
	replaceGlobal(t, "uni", undefined);
	replaceGlobal(t, "window", {
		URL: {
			createObjectURL: () => "blob:fast-test",
			revokeObjectURL: (value: string) => {
				events.push(value);
			},
		},
	});
	replaceGlobal(t, "document", { createElement: () => anchor, body: { appendChild: () => undefined } });
	const config: InternalAxiosRequestConfig = { headers: new AxiosHeaders(), url: "/download.txt" };
	assert.throws(
		() => axiosUtil.downloadFile({ ...response(config), data: new Blob(["content"]) }),
		(error) => error === failure
	);
	assert.deepEqual(events, ["remove", "blob:fast-test"]);
});

test("URLSearchParams and repeated query keys survive GET cache busting", async () => {
	const params = new URLSearchParams("tag=a&tag=b&page=2");
	await axiosUtil.request({
		url: "/search-params",
		method: "get",
		requestType: "query",
		params,
		adapter: (config) => {
			assert.ok(config.params instanceof URLSearchParams);
			assert.deepEqual(config.params.getAll("tag"), ["a", "b"]);
			assert.equal(config.params.get("page"), "2");
			assert.ok(config.params.has("_"));
			return Promise.resolve(response(config));
		},
	});
	assert.equal(params.has("_"), false);
});

test("request, response and error hooks await their asynchronous results", async () => {
	fastAxios.interceptors.request.use(async (config) => {
		await Promise.resolve();
		config.headers.set("X-Test-Context", "ready");
	});
	fastAxios.interceptors.response.use(async () => {
		await Promise.resolve();
		return "handled";
	});
	assert.equal(
		await axiosUtil.request({
			url: "/async-hooks",
			requestType: "query",
			adapter: (config) => {
				assert.equal(config.headers.get("X-Test-Context"), "ready");
				return Promise.resolve(response(config));
			},
		}),
		"handled"
	);
	const mapped = new Error("mapped after awaiting");
	fastAxios.interceptors.responseError.use(async () => {
		await Promise.resolve();
		return mapped;
	});
	await assert.rejects(
		axiosUtil.request({
			url: "/async-error",
			requestType: "query",
			adapter: (config) => {
				return Promise.reject(new AxiosError("network failed", AxiosError.ERR_NETWORK, config));
			},
		}),
		(error) => error === mapped
	);
});

test("null JSON and null decrypted responses are returned without a property access error", async () => {
	assert.equal(
		await axiosUtil.request({ url: "/null", requestType: "query", adapter: (config) => Promise.resolve({ ...response(config), data: null }) }),
		null
	);
	fastAxios.crypto.decrypt.use(() => null);
	assert.equal(await axiosUtil.request({ url: "/decrypted-null", requestType: "query", requestCipher: true, adapter: success }), null);
});

test("opaque uploads do not cancel different file bodies", async () => {
	const ready = Promise.withResolvers<void>();
	const finish = Promise.withResolvers<void>();
	let entered = 0;
	const adapter: AxiosAdapter = async (config) => {
		if (++entered === 2) ready.resolve();
		await finish.promise;
		return response(config);
	};
	const first = new FormData();
	first.append("name", "a");
	const second = new FormData();
	second.append("name", "b");
	const requests = [first, second].map((data) =>
		axiosUtil.request({ url: "/uploads", method: "post", requestType: "query", data, cancelDuplicateRequest: true, adapter })
	);
	try {
		await ready.promise;
	} finally {
		finish.resolve();
	}
	await Promise.all(requests);
});

test("cache opt-in requires a namespace and context invalidation rejects late writes", async () => {
	let calls = 0;
	const adapter: AxiosAdapter = (config) => Promise.resolve(response(config, ++calls));
	const options = { url: "/cache-context", method: "get", requestType: "query" as const, cache: true, adapter };
	fastAxios.cache.namespace = "";
	await axiosUtil.request(options);
	await axiosUtil.request(options);
	assert.equal(calls, 2);
	fastAxios.cache.namespace = "account-a";
	await axiosUtil.request(options);
	await axiosUtil.request(options);
	assert.equal(calls, 3);
	fastAxios.cache.namespace = "account-b";
	await axiosUtil.request(options);
	assert.equal(calls, 4);
	const entered = Promise.withResolvers<void>();
	const release = Promise.withResolvers<void>();
	const pending = axiosUtil.request({
		...options,
		url: "/late-cache",
		adapter: async (config) => {
			entered.resolve();
			await release.promise;
			return response(config, "old-session");
		},
	});
	await entered.promise;
	fastAxios.cache.clear();
	release.resolve();
	await pending;
	assert.equal(await axiosUtil.request({ ...options, url: "/late-cache" }), 5);
});

test("silent requests do not display offline or failed-file messages", async (t) => {
	let messages = 0;
	fastAxios.message.error.use(() => {
		messages++;
	});
	replaceGlobal(t, "navigator", { onLine: false });
	await assert.rejects(
		axiosUtil.request({
			url: "/silent-offline",
			requestType: "query",
			showErrorMessage: false,
			adapter: (config) => {
				return Promise.reject(new AxiosError("network failed", AxiosError.ERR_NETWORK, config));
			},
		})
	);
	await assert.rejects(
		axiosUtil.request({
			url: "/silent-file",
			requestType: "download",
			showErrorMessage: false,
			adapter: (config) => Promise.resolve({ ...response(config), status: 500 }),
		})
	);
	assert.equal(messages, 0);
});
