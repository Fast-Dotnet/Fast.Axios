import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import { AxiosHeaders, isAxiosError } from "axios";
import { axiosUtil, createFastAxios } from "../../src/axios/index";
import { replaceGlobal } from "../helpers/environment";
import type { AxiosResponse } from "axios";

const fastAxios = createFastAxios({ baseUrl: "https://api.example.test", requestCipher: false });
const bytes = new Uint8Array([0x50, 0x4b, 0, 255, 128]).buffer;
const fileResponse = (filename = "report.xlsx", data: ArrayBuffer | string = bytes): AxiosResponse<ArrayBuffer | string> => ({
	data,
	headers: new AxiosHeaders({ "Content-Disposition": `attachment; filename="${filename}"` }),
	status: 200,
	statusText: "OK",
	config: { headers: new AxiosHeaders(), url: "/file/download" },
});

beforeEach(() => {
	fastAxios.interceptors.request.use(() => undefined);
	fastAxios.interceptors.response.use(() => undefined);
	fastAxios.message.error.use(() => undefined);
});

describe("uni file downloads", () => {
	test("H5 POST exports receive binary data and save through the browser", async (t) => {
		let captured: UniNamespace.RequestOptions | undefined;
		let saved: Blob | undefined;
		let clicked = false;
		const anchor = {
			style: {},
			download: "",
			href: "",
			click: () => {
				clicked = true;
			},
			remove: () => undefined,
		};
		replaceGlobal(t, "window", {
			URL: {
				createObjectURL: (blob: Blob) => {
					saved = blob;
					return "blob:report";
				},
				revokeObjectURL: () => undefined,
			},
		});
		replaceGlobal(t, "document", { createElement: () => anchor, body: { appendChild: () => undefined } });
		replaceGlobal(t, "uni", {
			getAppBaseInfo: () => ({ uniPlatform: "web" }),
			request: (options: UniNamespace.RequestOptions) => {
				captured = options;
				queueMicrotask(() => {
					options.success?.({
						data: bytes,
						statusCode: 200,
						header: { "Content-Disposition": "attachment; filename*=UTF-8''%E6%8A%A5%E8%A1%A8.xlsx" },
						cookies: [],
						errMsg: "request:ok",
					});
					options.complete?.({ errMsg: "request:ok" });
				});
				return { abort: () => undefined };
			},
		});
		const result = await axiosUtil.request<AxiosResponse<ArrayBuffer>>({
			url: "/file/download",
			method: "post",
			data: { id: 42 },
			responseType: "blob",
			requestType: "download",
		});
		assert.equal(captured?.method, "POST");
		assert.equal(captured?.data, '{"id":42}');
		assert.equal(captured?.responseType, "arraybuffer");
		assert.equal(captured?.dataType, undefined);
		assert.equal(result.data, bytes);
		assert.equal(anchor.download, "报表.xlsx");
		assert.equal(clicked, true);
		assert.deepEqual(await saved?.arrayBuffer(), bytes);
	});

	for (const fileType of ["doc", "docx", "xls", "xlsx", "ppt", "pptx", "pdf"]) {
		test(`mini-program writes ${fileType} bytes before opening with sharing enabled`, async (t) => {
			const events: string[] = [];
			let writtenPath = "";
			replaceGlobal(t, "uni", {
				getAppBaseInfo: () => ({}),
				getSystemInfoSync: () => ({ uniPlatform: "mp-weixin" }),
				env: { USER_DATA_PATH: "/user" },
				getFileSystemManager: () => ({
					writeFile: (options: UniNamespace.WriteFileOption) => {
						events.push("write");
						assert.equal(options.data, bytes);
						assert.equal(options.encoding, undefined);
						writtenPath = options.filePath;
						options.success?.({ errMsg: "writeFile:ok", errCode: 0 });
					},
				}),
				openDocument: (options: UniNamespace.OpenDocumentOptions) => {
					events.push("open");
					assert.equal(options.filePath, writtenPath);
					assert.equal(options.fileType, fileType);
					assert.equal(options.showMenu, true);
					options.success?.({ errMsg: "openDocument:ok" });
				},
			});
			await axiosUtil.downloadFile(fileResponse(`../report.${fileType}`));
			assert.match(writtenPath, /^\/user\/fast-\d+-\d+-.._report\./);
			assert.deepEqual(events, ["write", "open"]);
		});
	}

	test("App writes Base64 binary through requestFileSystem before opening", async (t) => {
		const events: string[] = [];
		const writer = {
			onwrite: undefined as (() => void) | undefined,
			onerror: undefined as (() => void) | undefined,
			onabort: undefined as (() => void) | undefined,
			writeAsBinary: (data: string) => {
				events.push("write");
				assert.deepEqual(Buffer.from(data, "base64"), Buffer.from(bytes));
				writer.onwrite?.();
			},
		};
		replaceGlobal(t, "plus", {
			io: {
				PRIVATE_DOC: 2,
				requestFileSystem: (type: number, success: (fs: unknown) => void) => {
					assert.equal(type, 2);
					events.push("filesystem");
					success({
						root: {
							getFile: (name: string, flags: { exclusive: boolean }, success: (entry: unknown) => void) => {
								assert.match(name, /report.xlsx$/);
								assert.equal(flags.exclusive, true);
								success({
									createWriter: (success: (value: unknown) => void) => success(writer),
									toLocalURL: () => "_doc/report.xlsx",
								});
							},
						},
					});
				},
			},
		});
		replaceGlobal(t, "uni", {
			getAppBaseInfo: () => ({ uniPlatform: "app" }),
			arrayBufferToBase64: (data: ArrayBuffer) => Buffer.from(data).toString("base64"),
			openDocument: (options: UniNamespace.OpenDocumentOptions) => {
				events.push("open");
				assert.equal(options.filePath, "_doc/report.xlsx");
				assert.equal(options.showMenu, true);
				options.success?.({ errMsg: "openDocument:ok" });
			},
		});
		await axiosUtil.downloadFile(fileResponse());
		assert.deepEqual(events, ["filesystem", "write", "open"]);
		assert.equal(writer.onwrite, undefined);
		assert.equal(writer.onerror, undefined);
	});

	for (const platform of ["app", "mp-weixin"]) {
		test(`${platform} skips unsupported and unknown formats`, async (t) => {
			replaceGlobal(t, "uni", { getAppBaseInfo: () => ({ uniPlatform: platform }) });
			for (const name of ["archive.zip", "photo.png", "unknown"]) await axiosUtil.downloadFile(fileResponse(name));
		});
	}

	test("MIME identifies extensionless downloads and existing paths are reused", async (t) => {
		let opened = false;
		replaceGlobal(t, "uni", {
			getAppBaseInfo: () => ({ uniPlatform: "mp-weixin" }),
			openDocument: (options: UniNamespace.OpenDocumentOptions) => {
				assert.equal(options.filePath, "/tmp/document");
				assert.equal(options.fileType, "pdf");
				opened = true;
				options.success?.({ errMsg: "openDocument:ok" });
			},
		});
		const response = fileResponse("download", "/tmp/document");
		response.headers["content-type"] = "application/pdf; charset=binary";
		await axiosUtil.downloadFile(response);
		assert.equal(opened, true);
	});

	for (const stage of ["write", "open"] as const) {
		test(`${stage} failures reject the request with its response and obey message settings`, async (t) => {
			let messages = 0;
			fastAxios.message.error.use(() => {
				messages++;
			});
			replaceGlobal(t, "uni", {
				getAppBaseInfo: () => ({ uniPlatform: "mp-weixin" }),
				env: { USER_DATA_PATH: "/user" },
				getFileSystemManager: () => ({
					writeFile: (options: UniNamespace.WriteFileOption) => {
						if (stage === "write") options.fail?.({ errMsg: "write denied", errCode: 1 });
						else options.success?.({ errMsg: "writeFile:ok", errCode: 0 });
					},
				}),
				openDocument: (options: UniNamespace.OpenDocumentOptions) => {
					options.fail?.({ errMsg: "open denied" });
				},
			});
			for (const showErrorMessage of [true, false]) {
				await assert.rejects(
					axiosUtil.request({
						url: "/file/download",
						method: "post",
						requestType: "export",
						showErrorMessage,
						adapter: (config) => Promise.resolve({ ...fileResponse(), config }),
					}),
					(error: unknown) => {
						assert.ok(isAxiosError<unknown>(error));
						assert.equal(error.code, "ERR_BAD_RESPONSE");
						assert.equal(error.response?.data, bytes);
						assert.equal(error.message, `${stage} denied`);
						return true;
					}
				);
			}
			assert.equal(messages, 1);
		});
	}

	test("disabled automatic downloads preserve the response without platform file access", async (t) => {
		replaceGlobal(t, "uni", {});
		const result = await axiosUtil.request<AxiosResponse<ArrayBuffer>>({
			url: "/file/download",
			method: "post",
			requestType: "export",
			autoDownloadFile: false,
			adapter: (config) => Promise.resolve({ ...fileResponse(), config }),
		});
		assert.equal(result.data, bytes);
	});
});
