import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import axios, { AxiosError, AxiosHeaders } from "axios";
import { axiosUtil, createFastAxios } from "../../src/axios/index";
import { replaceGlobal } from "../helpers/environment";
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
	fastAxios.setOptions({ baseUrl: "https://api.example.test", timeout: 60000, headers: {}, requestCipher: false });
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

describe("configuration and request lifecycle", () => {
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

	test("single-request options override container defaults without mutating caller input", async () => {
		fastAxios.setOptions({ baseUrl: "https://global.example.test", timeout: 60000, headers: { "X-Global": "yes" }, requestCipher: true });
		let encryptions = 0;
		fastAxios.crypto.encrypt.use(() => {
			encryptions++;
		});
		const params = { page: 0 };
		const options = {
			url: "/options",
			requestType: "query" as const,
			baseURL: "",
			timeout: 0,
			requestCipher: false,
			getMethodCacheHandle: false,
			params,
			headers: { "X-Request": "yes" },
			adapter: (config: InternalAxiosRequestConfig) => {
				assert.equal(config.baseURL, "");
				assert.equal(config.timeout, 0);
				assert.equal(config.headers.get("X-Global"), "yes");
				assert.equal(config.headers.get("X-Request"), "yes");
				assert.deepEqual(config.params, params);
				return Promise.resolve(response(config, false));
			},
		};
		assert.equal(await axiosUtil.request(options), false);
		assert.equal(encryptions, 0);
		assert.deepEqual(params, { page: 0 });
	});

	test("success pipeline awaits hooks and orders loading, encryption and decryption", async () => {
		const events: string[] = [];
		fastAxios.interceptors.request.use(async () => {
			await Promise.resolve();
			events.push("request");
		});
		fastAxios.loading.show.use(() => {
			events.push("show");
		});
		fastAxios.loading.close.use(() => {
			events.push("close");
		});
		fastAxios.crypto.encrypt.use(() => {
			events.push("encrypt");
		});
		fastAxios.interceptors.response.use(() => {
			events.push("response");
		});
		fastAxios.crypto.decrypt.use(() => {
			events.push("decrypt");
			return { data: 0 };
		});
		assert.equal(
			await axiosUtil.request({
				url: "/order",
				requestType: "query",
				requestCipher: true,
				loading: true,
				adapter: (config) => {
					events.push("adapter");
					return Promise.resolve(response(config));
				},
			}),
			0
		);
		assert.deepEqual(events, ["request", "show", "encrypt", "adapter", "close", "response", "decrypt"]);
	});
});

describe("response and error contracts", () => {
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
			await axiosUtil.request({
				url: "/null",
				requestType: "query",
				adapter: (config) => Promise.resolve({ ...response(config), data: null }),
			}),
			null
		);
		fastAxios.crypto.decrypt.use(() => null);
		assert.equal(await axiosUtil.request({ url: "/decrypted-null", requestType: "query", requestCipher: true, adapter: success }), null);
	});

	test("response modes preserve full bodies and falsy custom takeover results", async () => {
		const body = { code: 200, success: true, data: false };
		const adapter: AxiosAdapter = (config) => Promise.resolve({ ...response(config), data: body });
		assert.deepEqual(await axiosUtil.request({ url: "/full", requestType: "query", simpleDataFormat: false, adapter }), body);
		assert.deepEqual(await axiosUtil.request({ url: "/raw", requestType: "query", restfulResult: false, adapter }), body);
		for (const result of [false, 0, ""]) {
			fastAxios.interceptors.response.use(() => result);
			assert.equal(await axiosUtil.request({ url: "/takeover", requestType: "query", adapter }), result);
		}
	});

	test("business and malformed responses reject once and respect the code-message switch", async () => {
		const messages: string[] = [];
		fastAxios.message.error.use((message) => {
			messages.push(message);
		});
		for (const body of [{ code: 422, message: { name: ["required"] } }, { code: 200, success: false, message: "denied" }, [1], "invalid"]) {
			const adapter: AxiosAdapter = (config) => Promise.resolve({ ...response(config), data: body });
			await assert.rejects(
				axiosUtil.request({ url: "/business", requestType: "query", loading: true, adapter }),
				(error: unknown) => error instanceof AxiosError && error.code === AxiosError.ERR_BAD_RESPONSE
			);
			const count = messages.length;
			await assert.rejects(axiosUtil.request({ url: "/silent-business", requestType: "query", showCodeMessage: false, adapter }));
			assert.equal(messages.length, count);
		}
		assert.equal(messages.length, 4);
		assert.equal(messages[0], '{"name":["required"]}');
		assert.equal(messages[1], "denied");
	});

	test("HTTP errors retain context and use body messages before registered status mappings", async () => {
		const messages: string[] = [];
		fastAxios.message.error.use((message) => {
			messages.push(message);
		});
		fastAxios.addErrorCode(503, "mapped unavailable");
		for (const data of [{ message: "body detail" }, {}]) {
			const adapter: AxiosAdapter = (config) => {
				const failed = { ...response(config), data, status: 503 };
				return Promise.reject(new AxiosError("unavailable", AxiosError.ERR_BAD_RESPONSE, config, undefined, failed));
			};
			await assert.rejects(axiosUtil.request({ url: "/http-error", requestType: "query", adapter }), (error: unknown) => {
				assert.ok(error instanceof AxiosError);
				assert.equal(error.response?.status, 503);
				return true;
			});
		}
		assert.deepEqual(messages, ["body detail", "mapped unavailable"]);
	});
});

describe("request identity and cache isolation", () => {
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

	for (const missingApi of ["crypto", "TextEncoder"]) {
		test(`request caching works without ${missingApi} and never exposes identity in storage keys`, async (context) => {
			const original = Object.getOwnPropertyDescriptor(globalThis, missingApi);
			context.after(() => {
				if (original) Object.defineProperty(globalThis, missingApi, original);
				else Reflect.deleteProperty(globalThis, missingApi);
			});
			Object.defineProperty(globalThis, missingApi, { configurable: true, value: undefined });
			const backend = new Map<string, unknown>();
			fastAxios.cache.get.use((key) => backend.get(key));
			fastAxios.cache.set.use((key, value) => {
				backend.set(key, value);
			});
			let calls = 0;
			const adapter: AxiosAdapter = (config) => Promise.resolve(response(config, ++calls));
			const options = {
				url: "/uni-cache",
				method: "get",
				requestType: "query" as const,
				cache: true,
				adapter,
				headers: { Authorization: "Bearer example-placeholder-a" },
			};
			assert.equal(await axiosUtil.request(options), 1);
			assert.equal(await axiosUtil.request(options), 1);
			assert.equal(calls, 1);
			assert.equal(await axiosUtil.request({ ...options, headers: { Authorization: "Bearer example-placeholder-b" } }), 2);
			assert.equal(await axiosUtil.request({ ...options, cacheNamespace: "different-tenant" }), 3);
			fastAxios.cache.clear();
			assert.equal(await axiosUtil.request(options), 4);
			for (const key of backend.keys()) {
				assert.doesNotMatch(key, /example-placeholder|Authorization|uni-cache|different-tenant/u);
			}
		});
	}

	test("fallback cache identity expires and remains bounded without Web Crypto", async (context) => {
		const original = Object.getOwnPropertyDescriptor(globalThis, "crypto");
		context.after(() => {
			if (original) Object.defineProperty(globalThis, "crypto", original);
			else Reflect.deleteProperty(globalThis, "crypto");
		});
		Object.defineProperty(globalThis, "crypto", { configurable: true, value: undefined });
		let now = 1_000;
		context.mock.method(Date, "now", () => now);
		let calls = 0;
		const adapter: AxiosAdapter = (config) => Promise.resolve(response(config, ++calls));
		const options = { url: "/fallback-bounds", requestType: "query" as const, cache: true, adapter };
		assert.equal(await axiosUtil.request(options), 1);
		now += 300_000;
		assert.equal(await axiosUtil.request(options), 2);
		for (let i = 0; i < 256; i++) await axiosUtil.request({ ...options, url: `/fallback-bounds/${i}` });
		assert.equal(await axiosUtil.request(options), 259);
	});

	test("duplicate cancellation affects only older equivalent requests and stays silent", async () => {
		const entered = Promise.withResolvers<void>();
		const release = Promise.withResolvers<void>();
		let messages = 0;
		fastAxios.message.error.use(() => {
			messages++;
		});
		const first = axiosUtil.request({
			url: "/duplicate",
			requestType: "query",
			getMethodCacheHandle: false,
			adapter: async (config) => {
				entered.resolve();
				await release.promise;
				return response(config, "old");
			},
		});
		const rejected = assert.rejects(first, (error: unknown) => axios.isCancel(error));
		try {
			await entered.promise;
			assert.equal(await axiosUtil.request({ url: "/duplicate", requestType: "query", getMethodCacheHandle: false, adapter: success }), "ok");
		} finally {
			release.resolve();
		}
		await rejected;
		assert.equal(messages, 0);
		assert.equal(await axiosUtil.request({ url: "/duplicate", requestType: "query", adapter: success }), "ok");
	});

	test("cache hits reuse final values and bypass network, loading and response transformation", async () => {
		const events: string[] = [];
		fastAxios.loading.show.use(() => {
			events.push("show");
		});
		fastAxios.loading.close.use(() => {
			events.push("close");
		});
		fastAxios.interceptors.response.use(() => {
			events.push("response");
		});
		const adapter: AxiosAdapter = (config) => {
			events.push("adapter");
			return Promise.resolve(response(config, 0));
		};
		const options = { url: "/cache-pipeline", requestType: "query" as const, cache: true, loading: true, adapter };
		assert.equal(await axiosUtil.request(options), 0);
		assert.equal(await axiosUtil.request(options), 0);
		assert.deepEqual(events, ["show", "adapter", "close", "response"]);
		for (const overrides of [{ method: "post" }, { restfulResult: false }, { simpleDataFormat: false }]) {
			await axiosUtil.request({ ...options, ...overrides });
			await axiosUtil.request({ ...options, ...overrides });
		}
		assert.equal(events.filter((event) => event === "adapter").length, 7);
	});
});

describe("file responses and browser resource ownership", () => {
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
});

describe("file response contracts", () => {
	test("download and export return complete responses when automatic saving is disabled", async () => {
		for (const requestType of ["download", "export"] as const) {
			const file = new Blob(["report"]);
			const result = await axiosUtil.request<AxiosResponse>({
				url: "/report",
				requestType,
				autoDownloadFile: false,
				adapter: (config) => {
					assert.equal(config.responseType, "blob");
					return Promise.resolve({ ...response(config), data: file });
				},
			});
			assert.equal(result.data, file);
			assert.equal(result.status, 200);
		}
	});

	test("browser saving uses encoded filenames and releases resources after success", (context) => {
		const events: string[] = [];
		const anchor = {
			style: {},
			href: "",
			download: "",
			click() {
				events.push("click");
			},
			remove() {
				events.push("remove");
			},
		};
		replaceGlobal(context, "uni", undefined);
		replaceGlobal(context, "window", {
			URL: {
				createObjectURL: () => "blob:report",
				revokeObjectURL: (url: string) => {
					events.push(url);
				},
			},
		});
		replaceGlobal(context, "document", {
			createElement: () => anchor,
			body: {
				appendChild: () => {
					events.push("append");
				},
			},
		});
		const config: InternalAxiosRequestConfig = { url: "/fallback.txt?x=1", headers: new AxiosHeaders() };
		for (const [header, filename] of [
			["attachment; filename*=UTF-8''%E6%8A%A5%E5%91%8A.txt", "报告.txt"],
			['attachment; filename="report.txt"', "report.txt"],
			["", "fallback.txt"],
		]) {
			axiosUtil.downloadFile({ ...response(config), data: new Blob(["report"]), headers: { "content-disposition": header } });
			assert.equal(anchor.download, filename);
			assert.equal(anchor.href, "blob:report");
		}
		assert.deepEqual(events, Array.from({ length: 3 }, () => ["append", "click", "remove", "blob:report"]).flat());
	});

	test("JSON Blob HTTP errors preserve the server message", async () => {
		const messages: string[] = [];
		fastAxios.message.error.use((message) => {
			messages.push(message);
		});
		await assert.rejects(
			axiosUtil.request({
				url: "/file-error",
				requestType: "download",
				adapter: (config) => {
					const failed = { ...response(config), status: 403, data: new Blob(['{"message":"file denied"}']) };
					return Promise.reject(new AxiosError("forbidden", AxiosError.ERR_BAD_REQUEST, config, undefined, failed));
				},
			})
		);
		assert.deepEqual(messages, ["file denied"]);
	});
});
