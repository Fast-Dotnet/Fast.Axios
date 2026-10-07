import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import axios, { AxiosError, AxiosHeaders } from "axios";
import { axiosUtil, createFastAxios } from "../../src/axios/index";
import { createUniAppAxiosAdapter } from "../../src/uni-adapter/index";
import { progressEventReducer, resolveUniAppRequestOptions } from "../../src/uni-adapter/utils";
import type { AxiosProgressEvent, InternalAxiosRequestConfig } from "axios";
import type { UniProgressResult } from "../../src/uni-adapter/type";

const originalUni = Object.getOwnPropertyDescriptor(globalThis, "uni");

const installUni = (value: unknown): void => {
	Object.defineProperty(globalThis, "uni", { configurable: true, value, writable: true });
};

afterEach(() => {
	if (originalUni) Object.defineProperty(globalThis, "uni", originalUni);
	else Reflect.deleteProperty(globalThis, "uni");
});

describe("uni request, upload and download lifecycle", () => {
	it("routes request, upload, and download methods to their matching uni APIs", async () => {
		const calls: { download?: UniNamespace.DownloadFileOption; request?: UniNamespace.RequestOptions; upload?: UniNamespace.UploadFileOption } =
			{};
		const requestTask = {
			abort() {
				return;
			},
			onHeadersReceived() {
				return;
			},
		};
		const uploadTask = {
			abort() {
				return;
			},
			onHeadersReceived() {
				return;
			},
			onProgressUpdate() {
				return;
			},
		};
		const downloadTask = {
			abort() {
				return;
			},
			onHeadersReceived() {
				return;
			},
			onProgressUpdate() {
				return;
			},
		};

		installUni({
			request(options: UniNamespace.RequestOptions) {
				calls.request = options;
				queueMicrotask(() => {
					options.success?.({
						cookies: ["sid=1"],
						data: { code: 200, data: { id: 1 } },
						errMsg: "request:ok",
						header: { X: "1" },
						statusCode: 200,
					});
					options.complete?.({ errMsg: "request:ok" });
				});
				return requestTask;
			},
			uploadFile(options: UniNamespace.UploadFileOption) {
				calls.upload = options;
				queueMicrotask(() => {
					options.success?.({ data: '{"code":200,"data":"file-id"}', errMsg: "uploadFile:ok", header: {}, statusCode: 200 });
					options.complete?.({ errMsg: "uploadFile:ok" });
				});
				return uploadTask;
			},
			downloadFile(options: UniNamespace.DownloadFileOption) {
				calls.download = options;
				queueMicrotask(() => {
					options.success?.({ errMsg: "downloadFile:ok", statusCode: 200, tempFilePath: "/tmp/report.xlsx" });
					options.complete?.({ errMsg: "downloadFile:ok" });
				});
				return downloadTask;
			},
		});

		const http = axios.create({ adapter: createUniAppAxiosAdapter(), baseURL: "https://api.example.com" });
		const requestResponse = await http.get("/users", { params: { page: 1 } });
		const uploadResponse = await http.upload<{ code: number; data: string }>(
			"/files/avatar",
			{ category: "avatar" },
			{ filePath: "/tmp/avatar.png", name: "file" }
		);
		const downloadResponse = await http.download<string>("/files/report");

		assert.deepEqual(requestResponse.data, { code: 200, data: { id: 1 } });
		assert.deepEqual(requestResponse.cookies, ["sid=1"]);
		assert.equal(uploadResponse.data.data, "file-id");
		assert.equal(downloadResponse.data, "/tmp/report.xlsx");
		assert.ok(calls.request);
		assert.ok(calls.upload);
		assert.ok(calls.download);
		assert.equal(calls.request["method"], "GET");
		assert.equal(calls.request["url"], "https://api.example.com/users?page=1");
		assert.equal(calls.upload.filePath, "/tmp/avatar.png");
		assert.deepEqual(calls.upload["formData"], { category: "avatar" });
		assert.equal(calls.download.url, "https://api.example.com/files/report");
	});

	it("rejects uni success callbacks that fail Axios validateStatus", async () => {
		const task = {
			abort() {
				return;
			},
			onHeadersReceived() {
				return;
			},
		};
		installUni({
			request(options: UniNamespace.RequestOptions) {
				queueMicrotask(() => {
					options.success?.({ cookies: [], data: "failed", errMsg: "request:ok", header: {}, statusCode: 503 });
					options.complete?.({ errMsg: "request:ok" });
				});
				return task;
			},
		});

		const http = axios.create({ adapter: createUniAppAxiosAdapter() });
		await assert.rejects(http.get("https://api.example.com/unavailable"), (error: unknown) => {
			assert.ok(error instanceof AxiosError);
			assert.equal(error.code, AxiosError.ERR_BAD_RESPONSE);
			assert.equal(error.response?.status, 503);
			return true;
		});
	});

	it("aborts the active uni task through AbortSignal", async () => {
		let aborted = false;
		const task = {
			abort() {
				aborted = true;
			},
			onHeadersReceived() {
				return;
			},
		};
		installUni({
			request() {
				return task;
			},
		});

		const controller = new AbortController();
		const http = axios.create({ adapter: createUniAppAxiosAdapter() });
		const pending = http.get("https://api.example.com/slow", { signal: controller.signal });
		controller.abort();

		await assert.rejects(pending, (error: unknown) => axios.isCancel(error));
		assert.equal(aborted, true);
	});

	for (const method of ["get", "upload", "download"]) {
		for (const [message, code, clarify] of [
			["task:fail timeout", AxiosError.ECONNABORTED, false],
			["task:fail TIMEOUT", AxiosError.ETIMEDOUT, true],
			["task:fail abort", AxiosError.ECONNABORTED, false],
			["task:fail network", AxiosError.ERR_NETWORK, false],
		] as const) {
			it(`${method} maps platform task failure ${message}`, async () => {
				const fail = (options: {
					fail?: (error: UniNamespace.GeneralCallbackResult) => void;
					complete?: (error: UniNamespace.GeneralCallbackResult) => void;
				}) => {
					queueMicrotask(() => {
						options.fail?.({ errMsg: message });
						options.complete?.({ errMsg: message });
					});
					return {
						abort() {
							return;
						},
						onHeadersReceived() {
							return;
						},
						onProgressUpdate() {
							return;
						},
					};
				};
				installUni({ request: fail, uploadFile: fail, downloadFile: fail });
				const http = axios.create({ adapter: createUniAppAxiosAdapter() });
				await assert.rejects(
					http.request({ url: "/failure", method, transitional: { clarifyTimeoutError: clarify }, timeoutErrorMessage: "custom timeout" }),
					(error: unknown) => {
						assert.ok(error instanceof AxiosError);
						assert.equal(error.code, code);
						assert.equal(error.config?.url, "/failure");
						assert.ok(error.request);
						assert.equal(error.message, message.toLowerCase().includes("timeout") ? "custom timeout" : message);
						return true;
					}
				);
			});
		}
	}

	it("completed tasks detach AbortSignal listeners and ignore later cancellation", async (context) => {
		const controller = new AbortController();
		const removal = context.mock.method(controller.signal, "removeEventListener");
		let aborted = 0;
		installUni({
			request(options: UniNamespace.RequestOptions) {
				queueMicrotask(() => {
					options.success?.({ data: "ok", statusCode: 200, header: {}, cookies: [] });
					options.complete?.({ errMsg: "request:ok" });
				});
				return {
					abort() {
						aborted++;
					},
					onHeadersReceived() {
						return;
					},
				};
			},
		});
		const http = axios.create({ adapter: createUniAppAxiosAdapter() });
		await http.get("/complete", { signal: controller.signal });
		assert.equal(removal.mock.callCount(), 1);
		controller.abort();
		assert.equal(aborted, 0);
	});

	it("CancelToken cancellation preserves its reason and aborts the matching task", async () => {
		const source = axios.CancelToken.source();
		let aborted = 0;
		installUni({
			request() {
				return {
					abort() {
						aborted++;
					},
					onHeadersReceived() {
						return;
					},
				};
			},
		});
		const http = axios.create({ adapter: createUniAppAxiosAdapter() });
		const pending = http.get("/cancel-token", { cancelToken: source.token });
		source.cancel("caller canceled");
		await assert.rejects(pending, (error: unknown) => axios.isCancel(error) && error.message === "caller canceled");
		assert.equal(aborted, 1);
	});

	for (const method of ["get", "upload", "download"]) {
		it(`${method} applies default and custom Axios HTTP status validation`, async () => {
			let status = 401;
			const task = {
				abort() {
					return;
				},
				onHeadersReceived() {
					return;
				},
			};
			installUni({
				request(options: UniNamespace.RequestOptions) {
					queueMicrotask(() => {
						options.success?.({ data: "body", header: {}, cookies: [], statusCode: status });
						options.complete?.({ errMsg: "ok" });
					});
					return task;
				},
				uploadFile(options: UniNamespace.UploadFileOption) {
					queueMicrotask(() => {
						options.success?.({ data: "body", header: {}, statusCode: status });
						options.complete?.({ errMsg: "ok" });
					});
					return task;
				},
				downloadFile(options: UniNamespace.DownloadFileOption) {
					queueMicrotask(() => {
						options.success?.({ tempFilePath: "/tmp/file", statusCode: status });
						options.complete?.({ errMsg: "ok" });
					});
					return task;
				},
			});
			const http = axios.create({ adapter: createUniAppAxiosAdapter() });
			await assert.rejects(
				http.request({ url: "/status", method }),
				(error: unknown) => error instanceof AxiosError && error.code === AxiosError.ERR_BAD_REQUEST && error.response?.status === 401
			);
			status = 503;
			await assert.rejects(
				http.request({ url: "/status", method }),
				(error: unknown) => error instanceof AxiosError && error.code === AxiosError.ERR_BAD_RESPONSE
			);
			const result = await http.request({ url: "/status", method, validateStatus: () => true });
			assert.equal(result.status, 503);
		});
	}

	for (const method of ["get", "upload", "download"] as const) {
		it(`${method} connects native header and progress callbacks to Axios observers`, async () => {
			let progress: ((event: UniProgressResult) => void) | undefined;
			let headers: ((event: { header: Record<string, string> }) => void) | undefined;
			const task = {
				abort() {
					return;
				},
				onHeadersReceived(listener: typeof headers) {
					headers = listener;
				},
				onProgressUpdate(listener: typeof progress) {
					progress = listener;
				},
			};
			const emit = () => {
				headers?.({ header: { "X-Task": "ready" } });
				if (method === "upload") progress?.({ progress: 50, totalBytesSent: 5, totalBytesExpectedToSend: 10 });
				if (method === "download") progress?.({ progress: 50, totalBytesWritten: 5, totalBytesExpectedToWrite: 10 });
			};
			installUni({
				request(options: UniNamespace.RequestOptions) {
					queueMicrotask(() => {
						emit();
						options.success?.({ data: "body", header: {}, cookies: [], statusCode: 200 });
						options.complete?.({ errMsg: "ok" });
					});
					return task;
				},
				uploadFile(options: UniNamespace.UploadFileOption) {
					queueMicrotask(() => {
						emit();
						options.success?.({ data: "body", header: {}, statusCode: 200 });
						options.complete?.({ errMsg: "ok" });
					});
					return task;
				},
				downloadFile(options: UniNamespace.DownloadFileOption) {
					queueMicrotask(() => {
						emit();
						options.success?.({ tempFilePath: "/tmp/file", statusCode: 200 });
						options.complete?.({ errMsg: "ok" });
					});
					return task;
				},
			});
			const receivedHeaders: string[] = [];
			const receivedProgress: AxiosProgressEvent[] = [];
			const listener = (event: AxiosProgressEvent) => {
				receivedProgress.push(event);
			};
			const http = axios.create({ adapter: createUniAppAxiosAdapter() });
			await http.request({
				url: "/events",
				method,
				onHeadersReceived: (event) => {
					receivedHeaders.push(event.header["X-Task"] ?? "");
				},
				onUploadProgress: listener,
				onDownloadProgress: listener,
			});
			assert.deepEqual(receivedHeaders, ["ready"]);
			assert.equal(receivedProgress.length, method === "get" ? 0 : 1);
			if (method !== "get") {
				assert.equal(receivedProgress[0]?.loaded, 5);
				assert.equal(receivedProgress[0]?.[method], true);
			}
		});
	}
});

describe("uni options and Axios progress mapping", () => {
	it("maps URL, headers, auth, binary data and native options without changing caller headers", () => {
		const config: InternalAxiosRequestConfig = {
			url: "/binary",
			baseURL: "https://api.example.test",
			method: "post",
			params: { page: 0 },
			headers: new AxiosHeaders({ Authorization: "old", "X-Multi": ["a", "b"] }),
			auth: { username: "example", password: "示例" },
			responseType: "arraybuffer",
			timeout: 0,
			enableHttp2: true,
			enableCookie: false,
			sslVerify: false,
			redirect: "manual",
		};
		const options = resolveUniAppRequestOptions(config);
		assert.equal(options.url, "https://api.example.test/binary?page=0");
		assert.equal(options.method, "POST");
		assert.equal(options.timeout, 0);
		assert.equal(options.responseType, "arraybuffer");
		assert.equal(options.dataType, undefined);
		assert.equal(options.enableHttp2, true);
		assert.equal(options.enableCookie, false);
		assert.equal(options.sslVerify, false);
		assert.equal(options.redirect, "manual");
		assert.equal(options.header?.["X-Multi"], "a, b");
		assert.equal(options.header?.["Authorization"], `Basic ${Buffer.from("example:示例").toString("base64")}`);
		assert.equal(config.headers.get("Authorization"), "old");
	});

	it("restores upload form fields and lets explicit formData override transformed data", () => {
		const config: InternalAxiosRequestConfig = {
			url: "/upload",
			method: "UPLOAD",
			data: '{"category":"avatar"}',
			headers: new AxiosHeaders({ "Content-Type": "application/json" }),
			filePath: "/tmp/a",
			name: "file",
		};
		const options = resolveUniAppRequestOptions(config);
		assert.equal(options.method, "POST");
		assert.deepEqual(options.formData, { category: "avatar" });
		assert.equal(options.header?.["Content-Type"], undefined);
		assert.equal(config.headers.get("Content-Type"), "application/json");
		assert.deepEqual(resolveUniAppRequestOptions({ ...config, formData: { explicit: 0 } }).formData, { explicit: 0 });
		for (const data of ["plain", "null", "[]", "false"]) assert.deepEqual(resolveUniAppRequestOptions({ ...config, data }).formData, {});
	});

	for (const direction of ["upload", "download"] as const) {
		it(`${direction} progress reports byte deltas, rate, remaining time and unknown totals`, (context) => {
			let now = 0;
			context.mock.method(Date, "now", () => now);
			const events: AxiosProgressEvent[] = [];
			const listener = progressEventReducer((event) => {
				events.push(event);
			}, direction);
			const update = (loaded: number, total: number) => {
				if (direction === "upload") listener({ progress: 50, totalBytesSent: loaded, totalBytesExpectedToSend: total });
				else listener({ progress: 50, totalBytesWritten: loaded, totalBytesExpectedToWrite: total });
			};
			now = 1000;
			update(50, 100);
			now = 2000;
			update(100, 100);
			update(120, 0);
			assert.equal(events[0]?.bytes, 50);
			assert.equal(events[0]?.rate, 50);
			assert.equal(events[0]?.estimated, 1);
			assert.equal(events[0]?.progress, 0.5);
			assert.equal(events[0]?.[direction], true);
			assert.equal(events[1]?.bytes, 50);
			assert.equal(events[2]?.lengthComputable, false);
			assert.equal(events[2]?.progress, undefined);
			assert.equal(events[2]?.rate, undefined);
		});
	}
});

describe("platform-neutral default cache", () => {
	it("uses default cache without browser crypto or DOM APIs", async (context) => {
		for (const name of ["crypto", "TextEncoder", "window", "document", "navigator"]) {
			const original = Object.getOwnPropertyDescriptor(globalThis, name);
			context.after(() => {
				if (original) Object.defineProperty(globalThis, name, original);
				else Reflect.deleteProperty(globalThis, name);
			});
			Object.defineProperty(globalThis, name, { configurable: true, value: undefined });
		}
		let requests = 0;
		const api = {
			request(options: UniNamespace.RequestOptions) {
				requests++;
				queueMicrotask(() => {
					options.success?.({ data: { code: 200, data: false }, statusCode: 200, header: {}, cookies: [] });
					options.complete?.({ errMsg: "request:ok" });
				});
				return {
					abort() {
						return;
					},
					onHeadersReceived() {
						return;
					},
				};
			},
		};
		Object.defineProperty(globalThis, "uni", { configurable: true, value: api });
		const container = createFastAxios({ requestCipher: false });
		container.cache.namespace = "example-account";
		const options = { url: "https://api.example.test/default-cache", requestType: "query" as const, cache: true };
		assert.equal(await axiosUtil.request(options), false);
		assert.equal(await axiosUtil.request(options), false);
		assert.equal(requests, 1);
		container.cache.clear();
		assert.equal(await axiosUtil.request(options), false);
		assert.equal(requests, 2);
	});
});
