import axios, { AxiosError, AxiosHeaders } from "axios";
import { createUniAppAxiosAdapter } from "../uni-adapter";
import { createCacheKey } from "./cache-identity";
import { useFastAxios } from "./fastAxios";
import { appendCacheBuster, serializeRequestBody } from "./request-identity";
import type { AxiosResponse, Canceler, InternalAxiosRequestConfig } from "axios";
import type { ApiResponse, AxiosOptions, FastAxiosRequestConfig } from "./types";

/** 单次请求没有显式配置时采用的 Fast 流程默认值。 */
const axiosOptions = {
	// 默认取消相同 key 的上一条未完成请求。
	cancelDuplicateRequest: true,
	// Loading 默认关闭，由具体业务请求按需开启。
	loading: false,
	loadingText: "加载中...",
	// 响应缓存默认关闭，避免未明确授权时复用业务数据。
	cache: false,
	// 未启用加密的 GET 请求默认追加时间戳，绕过浏览器和代理缓存。
	getMethodCacheHandle: true,
	// Fast RESTful 响应默认直接返回 data，并自动展示两类错误信息。
	simpleDataFormat: true,
	showErrorMessage: true,
	showCodeMessage: true,
	// 浏览器文件响应默认自动保存；uni-app 仍只返回临时文件路径。
	autoDownloadFile: true,
	// 该值仅补齐 Required 类型；请求实际默认值来自 createFastAxios().requestCipher。
	requestCipher: true,
	// JSON 响应默认按 Fast ApiResponse 结构校验和拆包。
	restfulResult: true,
} satisfies Required<AxiosOptions>;

/** 单次请求经过默认值和全局配置合并后，内部所有 Fast 扩展字段均为确定值。 */
type ResolvedRequestOptions<Input> = FastAxiosRequestConfig<Input> & Required<AxiosOptions> & { method: string };

// 所有 FastAxios 请求共享重复请求表；每个 key 只保存当前仍在执行的那一个取消函数。
const pendingMap = new Map<string, Canceler>();

/**
 * 根据实际请求生成进程内去重标识；无法可靠序列化的请求体默认不参与自动去重。
 *
 * 标识只在请求期间保留，不写入缓存或取消错误。显式 duplicateKey 表示调用方负责判断等价请求。
 */
const getRequestKey = (config: InternalAxiosRequestConfig, duplicateKey?: string): string | undefined => {
	const data = duplicateKey ?? serializeRequestBody(config.data);
	if (data === undefined) return undefined;
	return JSON.stringify([
		axios.getUri(config),
		(config.method ?? "GET").toUpperCase(),
		data,
		Object.entries(AxiosHeaders.from(config.headers).toJSON()).sort(([left], [right]) => left.localeCompare(right)),
		config.auth,
		config.withCredentials,
		duplicateKey === undefined ? "body" : "explicit",
	]);
};

/**
 * 取消并移除同 key 的上一条请求；新请求必须在此操作完成后再写入 pendingMap。
 *
 * @param key - 当前请求计算出的重复请求 key。
 */
const cancelPendingRequest = (key: string): void => {
	const cancel = pendingMap.get(key);
	if (!cancel) return;

	// 先删除再取消，避免旧请求的异步错误清理误命中新写入的请求。
	pendingMap.delete(key);
	cancel("Duplicate request canceled.");
};

/**
 * 为当前请求创建独立 CancelToken，并返回用于精确清理 pendingMap 的取消函数引用。
 *
 * 调用方已经提供 CancelToken 时不覆盖它；该请求仍可取消上一条重复请求，但不会加入自动重复取消表。
 *
 * @param key - 当前请求的重复请求 key。
 * @param config - 即将交给 Axios adapter 的内部请求配置。
 * @returns 当前请求对应的取消函数；已有外部 CancelToken 时返回 undefined。
 */
const addPendingRequest = (key: string, config: InternalAxiosRequestConfig): Canceler | undefined => {
	if (config.cancelToken) return undefined;

	const source = axios.CancelToken.source();
	config.cancelToken = source.token;
	pendingMap.set(key, source.cancel);
	return source.cancel;
};

/**
 * 仅当 map 中仍是当前请求的取消函数时才删除，不能取消任何正在执行的请求。
 *
 * @param key - 请求拦截器生成的 key；拦截器尚未执行时可能为 undefined。
 * @param cancel - 当前请求写入 pendingMap 的取消函数。
 */
const removePendingRequest = (key: string | undefined, cancel: Canceler | undefined): void => {
	if (key && cancel && pendingMap.get(key) === cancel) pendingMap.delete(key);
};

/**
 * 将服务端 message 安全转换为可供 UI 和 AxiosError 使用的字符串。
 *
 * @param message - Fast RESTful 接口返回的任意 message 值。
 * @returns 可展示字符串；null、undefined、函数等无有效文本的值返回 undefined。
 */
const normalizeMessage = (message: unknown): string | undefined => {
	// 字符串无需转换，避免 JSON.stringify 后额外出现引号。
	if (typeof message === "string") return message;
	if (message === undefined || message === null) return undefined;
	// 基础值使用模板字符串转换，保留 0 和 false 等有效错误信息。
	if (typeof message === "number" || typeof message === "boolean" || typeof message === "bigint") return `${message}`;
	if (typeof message === "symbol") return message.description;

	try {
		// Fast 验证错误经常是字段到错误数组的对象，需要序列化后交给 UI 组件展示。
		return typeof message === "object" ? JSON.stringify(message) : undefined;
	} catch {
		return useFastAxios().t("unserializableMessage");
	}
};

/**
 * 从 AxiosError 中提取 Fast RESTful 错误信息，并在 Blob 错误体中尝试解析 JSON message。
 *
 * 错误信息优先级为：响应体 message → 自定义 errorCode 映射 → default 通用提示。
 *
 * @param error - Axios adapter、HTTP 状态校验或请求拦截器产生的错误。
 * @returns 最终传给 Message error 处理器的文字。
 */
const httpErrorStatusHandle = async <Input>(error: AxiosError<unknown, Input>): Promise<string> => {
	const fastAxios = useFastAxios();
	let responseData = error.response?.data;

	// 浏览器下载接口失败时，服务端 JSON 错误通常被 Axios 包装成 Blob，必须先读取文本才能获得 message。
	if (error.config?.responseType === "blob" && responseData && typeof (responseData as { text?: unknown }).text === "function") {
		try {
			const text = await (responseData as { text: () => Promise<string> }).text();
			responseData = JSON.parse(text) as unknown;
		} catch {
			// Blob 不是 JSON 时继续使用 Axios code/status 的默认错误信息。
		}
	}

	// 仅对象响应体可能携带 Fast code/message；字符串或二进制内容直接走错误码映射。
	const errorBody = responseData && typeof responseData === "object" ? (responseData as { code?: string | number; message?: unknown }) : undefined;
	const code = (errorBody?.code ?? error.response?.status ?? error.code ?? error.message) || "default";
	return normalizeMessage(errorBody?.message) ?? fastAxios.errorCode[code] ?? fastAxios.errorCode["default"] ?? fastAxios.t("default");
};

/**
 * 从 Content-Disposition 或请求 URL 中提取下载文件名。
 *
 * @param response - 已通过 Axios 状态校验的文件响应。
 * @returns RFC 5987 文件名、普通 filename、URL 末段或最终兜底名称 download。
 */
const getDownloadFileName = (response: AxiosResponse): string => {
	const headerValue = response.headers["content-disposition"] as unknown;
	const disposition = typeof headerValue === "string" ? headerValue : "";
	// 优先读取支持 UTF-8 的 filename*，再兼容普通 filename="..." 格式。
	const encodedName = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1];
	const basicName = /filename="?([^";]+)"?/i.exec(disposition)?.[1];
	const urlName = response.config.url?.split("?")[0]?.split("/").pop();
	const rawName = encodedName ?? basicName ?? urlName ?? "download";

	try {
		// 服务端常把中文、空格等字符进行 URL 编码，下载前恢复原始文件名。
		return decodeURIComponent(rawName);
	} catch {
		return rawName;
	}
};

/**
 * 在浏览器中保存 Axios 文件响应。
 *
 * uni-app 下载由 uni-adapter 返回临时文件路径，此函数不重复处理平台文件系统。
 *
 * @param response - data 为 Blob 或可构造 Blob 数据的 Axios 文件响应。
 * @throws Error 非 uni-app 且运行环境缺少浏览器下载 API 时抛出。
 */
const downloadFile = (response: AxiosResponse): void => {
	// uni.downloadFile 已经把文件保存到平台临时目录，不能再使用 DOM 重复下载。
	if (typeof uni !== "undefined") return;
	if (typeof window === "undefined" || typeof document === "undefined" || typeof Blob === "undefined") {
		throw new Error("当前运行环境不支持浏览器文件下载 API。");
	}

	// Axios 已返回 Blob 时直接复用；其他二进制或文本数据统一包装成下载 Blob。
	const blob = response.data instanceof Blob ? response.data : new Blob([response.data], { type: "application/octet-stream;charset=UTF-8" });
	const downloadElement = document.createElement("a");
	const href = window.URL.createObjectURL(blob);
	// 临时 a 标签不参与页面布局，只借助浏览器原生 download 能力触发保存。
	downloadElement.style.display = "none";
	downloadElement.href = href;
	downloadElement.download = getDownloadFileName(response);
	try {
		document.body.appendChild(downloadElement);
		downloadElement.click();
	} finally {
		// 挂载或点击失败也必须释放本次创建的对象；不移除其他节点。
		try {
			downloadElement.remove();
		} finally {
			window.URL.revokeObjectURL(href);
		}
	}
};

/**
 * 将可选扩展配置解析为请求流程内部可直接使用的完整配置。
 *
 * 此步骤只合并配置和选择文件任务，不创建 Axios 实例，也不执行任何用户处理器。
 *
 * @param config - Fast.NET 生成或调用方手写的单次请求配置。
 * @param defaultRequestCipher - `createFastAxios()` 保存的全局加解密开关。
 * @returns Fast 扩展字段均已有确定值，并完成 upload/download/export 平台映射的新配置。
 */
const resolveRequestOptions = <Input>(config: FastAxiosRequestConfig<Input>, defaultRequestCipher: boolean): ResolvedRequestOptions<Input> => {
	// method 保留 Fast.NET 生成值；upload/download 是 uni adapter 识别的文件任务标记。
	const method = config.method ?? "GET";
	const options: ResolvedRequestOptions<Input> = {
		// 先保留 Axios 原生配置和 Fast.NET 生成的文件字段，再补齐所有 Fast 扩展默认值。
		...config,
		method,
		cancelDuplicateRequest: config.cancelDuplicateRequest ?? axiosOptions.cancelDuplicateRequest,
		loading: config.loading ?? axiosOptions.loading,
		loadingText: config.loadingText ?? useFastAxios().t("loading"),
		cache: config.cache ?? axiosOptions.cache,
		getMethodCacheHandle: config.getMethodCacheHandle ?? axiosOptions.getMethodCacheHandle,
		simpleDataFormat: config.simpleDataFormat ?? axiosOptions.simpleDataFormat,
		showErrorMessage: config.showErrorMessage ?? axiosOptions.showErrorMessage,
		showCodeMessage: config.showCodeMessage ?? axiosOptions.showCodeMessage,
		autoDownloadFile: config.autoDownloadFile ?? axiosOptions.autoDownloadFile,
		// 单次请求配置优先；未设置时继承 createFastAxios() 的全局加密开关。
		requestCipher: config.requestCipher ?? defaultRequestCipher,
		restfulResult: config.restfulResult ?? axiosOptions.restfulResult,
	};

	// Fast.NET 把 Download 和 Export 都视为返回文件的业务行为。
	const isFileDownload = config.requestType === "download" || config.requestType === "export";
	if (typeof uni === "undefined" && isFileDownload && config.responseType === undefined) {
		// Fast.NET 把 Download/Export 都生成为文件响应；浏览器未显式配置时默认接收 Blob。
		options.responseType = "blob";
	}

	return options;
};

/**
 * 按 Fast 项目约定执行一次 Axios 请求。
 *
 * 保留重复请求取消、缓存、Loading、加解密、RESTful 校验、文件下载和自定义处理器等现有核心能力。
 *
 * @typeParam Output - 调用方最终获得的业务数据类型；文件请求应声明为对应的 AxiosResponse 类型。
 * @typeParam Input - Axios data 请求体类型。
 * @param axiosConfig - Fast.NET 生成或业务代码传入的完整请求配置。
 * @returns RESTful 简洁数据、自定义响应处理结果、原始响应体或文件 AxiosResponse。
 * @throws AxiosError 网络、超时、取消、HTTP 状态、Fast 业务 code 或文件响应校验失败时抛出。
 */
const createAxios = async <Output = unknown, Input = unknown>(axiosConfig: FastAxiosRequestConfig<Input>): Promise<Output> => {
	// 全部请求都从已初始化的全局容器读取 baseURL、公共请求头和项目级处理器。
	const fastAxios = useFastAxios();
	const options = resolveRequestOptions(axiosConfig, fastAxios.requestCipher);
	const method = options.method.toUpperCase();

	// 显式命名空间负责账号/租户/语言和 Cookie 会话隔离；没有声明时不复用响应。
	const cacheGeneration = fastAxios.cache.generation;
	const cacheNamespace = options.cacheNamespace ?? fastAxios.cache.namespace;
	const canUseCache = options.cache && options.restfulResult && options.simpleDataFormat && cacheNamespace.length > 0;
	let cacheKey: string | undefined;
	let cacheHit: { value: unknown } | undefined;

	// 同一个时间戳同时提供给自定义加密器和未加密 GET 的防缓存参数。
	const timestamp = Date.now();
	// 这两个闭包变量在请求拦截器中赋值，在请求完成后用于精确清理当前 pending 记录。
	let pendingKey: string | undefined;
	let pendingCancel: Canceler | undefined;
	let loadingShown = false;
	// 未进入 show 的请求（例如提前取消或请求处理器抛错）不能关闭其他请求的 Loading。
	const closeLoading = (): void => {
		if (!loadingShown) return;
		loadingShown = false;
		fastAxios.loading.close(options);
	};
	// 每次请求创建独立 Axios 实例，使本次 options 和拦截器闭包不会污染其他并发请求。
	const instance = axios.create({
		// uni-app 环境使用专用 adapter；浏览器和 Node.js 继续使用 Axios 默认 adapter。
		adapter: typeof uni !== "undefined" ? createUniAppAxiosAdapter() : undefined,
		baseURL: fastAxios.baseUrl,
		timeout: fastAxios.timeout,
		headers: fastAxios.headers,
		responseType: "json",
	});

	// 请求拦截
	instance.interceptors.request.use(
		async (config: InternalAxiosRequestConfig<Input>) => {
			// 等待当前处理器补齐身份、租户和参数后，再进行去重及缓存查询。
			await fastAxios.interceptors.request(config);
			const fileTask =
				(config.method ?? method).toUpperCase() === "UPLOAD" ||
				Reflect.get(config, "filePath") !== undefined ||
				Reflect.get(config, "files") !== undefined;
			pendingKey = fileTask && options.duplicateKey === undefined ? undefined : getRequestKey(config, options.duplicateKey);
			if (options.cancelDuplicateRequest && pendingKey !== undefined) {
				cancelPendingRequest(pendingKey);
				pendingCancel = addPendingRequest(pendingKey, config);
			}
			if (
				canUseCache &&
				(config.method ?? "GET").toUpperCase() === "GET" &&
				pendingKey !== undefined &&
				cacheGeneration === fastAxios.cache.generation
			) {
				cacheKey = await createCacheKey(fastAxios.cache, cacheNamespace, pendingKey, cacheGeneration);
				if (cacheKey !== undefined && cacheGeneration === fastAxios.cache.generation) {
					const cachedValue = fastAxios.cache.get(cacheKey);
					if (cachedValue !== null && cachedValue !== undefined) {
						cacheHit = { value: cachedValue };
						// 仍经过 Axios 自己的取消检查；不再触发网络、Loading、解密或响应接管。
						config.adapter = () => Promise.resolve({ data: undefined, status: 200, statusText: "OK", headers: {}, config });
						return config;
					}
				}
			}

			// 自定义请求处理完成后再显示 Loading；处理器抛错时不会留下已打开的 Loading。
			if (options.loading) {
				fastAxios.loading.show(options.loadingText);
				loadingShown = true;
			}

			if (config.responseType === "json") {
				if (options.requestCipher) {
					// 加密器可修改 data、params、headers，也可用 timestamp 生成签名或随机因子。
					fastAxios.crypto.encrypt(config, timestamp);
				} else if (options.getMethodCacheHandle && (config.method ?? "GET").toUpperCase() === "GET") {
					// 未启用加密时追加时间戳，避免浏览器或代理复用过期 GET 响应。
					config.params = appendCacheBuster(config.params, timestamp);
				}
			}

			return config;
		},
		// 请求配置或自定义请求处理器抛出的错误保持原样进入下方统一错误流程。
		async (error: unknown) => Promise.reject(error)
	);

	// 响应拦截
	instance.interceptors.response.use(
		(async (response: AxiosResponse<unknown, Input>): Promise<Output> => {
			// 成功回调中抛出的业务错误不会进入同一组失败回调，因此先完成 pending 和 Loading 清理。
			removePendingRequest(pendingKey, pendingCancel);
			closeLoading();

			if (cacheHit !== undefined) return cacheHit.value as Output;

			const customResponse = await fastAxios.interceptors.response(response, options);
			// 非空自定义结果表示 Fast 项目已经完整接管响应，不再执行文件、RESTful、解密和缓存流程。
			if (customResponse !== null && customResponse !== undefined) {
				return customResponse as Output;
			}

			// method: download 是 uni adapter 的下载标记；Fast.NET 业务类型和显式 Blob 同样进入文件响应流程。
			const isDownload =
				(response.config.method ?? method).toUpperCase() === "DOWNLOAD" ||
				options.requestType === "download" ||
				options.requestType === "export" ||
				response.config.responseType === "blob";
			if (isDownload) {
				// 自定义 validateStatus 可能允许非 2xx 文件响应，因此文件流程仍需单独校验成功区间。
				if (response.status < 200 || response.status > 299) {
					const message = fastAxios.errorCode["fileDownloadError"] ?? fastAxios.t("fileDownloadError");
					if (options.showErrorMessage) fastAxios.message.error(message);
					throw new AxiosError(message, AxiosError.ERR_BAD_RESPONSE, response.config, response.request, response);
				}

				// 浏览器按配置触发保存；uni-app 中 downloadFile() 会直接返回，data 保留临时文件路径。
				if (options.autoDownloadFile) downloadFile(response);
				return response as Output;
			}

			if (response.config.responseType !== "json") {
				// 非 JSON 非文件响应不执行 RESTful 和解密；简洁模式返回 data，否则返回完整 AxiosResponse。
				return (options.simpleDataFormat ? response.data : response) as Output;
			}

			// JSON 响应先按服务端原始结构校验 Fast code/success，再交给项目解密器转换内容。
			let responseData: unknown = response.data;
			if (options.restfulResult && responseData !== null && responseData !== undefined) {
				if (typeof responseData !== "object" || Array.isArray(responseData)) {
					const message = fastAxios.t("invalidResponse");
					if (options.showCodeMessage) fastAxios.message.error(message);
					throw new AxiosError(message, AxiosError.ERR_BAD_RESPONSE, response.config, response.request, response);
				}
				const restfulData = responseData as ApiResponse<Output, Input>;
				const code = restfulData.code ?? response.status;
				if (code < 200 || code > 299 || restfulData.success === false) {
					// 服务端 message 优先于本地 code 映射，确保业务接口的具体错误能够展示给用户。
					const message = normalizeMessage(restfulData.message) ?? fastAxios.errorCode[code] ?? fastAxios.t("500");
					if (options.showCodeMessage) fastAxios.message.error(message);

					const apiError = new AxiosError(message, AxiosError.ERR_BAD_RESPONSE, response.config, response.request, response);
					throw apiError;
				}
			}

			// 默认解密器返回 response.data；自定义解密器必须返回后续拆包需要处理的完整响应体。
			if (options.requestCipher) responseData = fastAxios.crypto.decrypt(response, options);
			// 只有 RESTful + 简洁模式提取 data；其他 JSON 请求保持完整响应体结构。
			if (
				options.restfulResult &&
				responseData !== null &&
				responseData !== undefined &&
				(typeof responseData !== "object" || Array.isArray(responseData))
			) {
				const message = fastAxios.t("invalidDecryptedResponse");
				if (options.showCodeMessage) fastAxios.message.error(message);
				throw new AxiosError(message, AxiosError.ERR_BAD_RESPONSE, response.config, response.request, response);
			}
			// 空响应原样返回，不能通过属性访问把 null/undefined 转成 SDK 内部异常。
			const result =
				options.restfulResult && options.simpleDataFormat && responseData != null
					? (responseData as ApiResponse<Output, Input>).data
					: responseData;

			// 缓存最终 result，而不是未解密响应，确保缓存命中与首次请求返回完全一致。
			if (cacheKey && cacheGeneration === fastAxios.cache.generation) fastAxios.cache.set(cacheKey, result);
			return result as Output;
		}) as unknown as NonNullable<Parameters<typeof instance.interceptors.response.use>[0]>,
		async (error: unknown) => {
			// 请求配置、adapter 和 HTTP 状态错误统一进入失败回调，并与成功回调对称释放公共状态。
			removePendingRequest(pendingKey, pendingCancel);
			closeLoading();

			if (!axios.isAxiosError<unknown, Input>(error)) {
				// 非 AxiosError 通常来自请求处理器或 adapter 外部代码，保持原值交给调用方或全局异常处理器。
				throw error;
			}

			if (axios.isCancel(error)) {
				// 取消属于可预期的控制流程，不在 SDK 内重复输出日志。
				throw error;
			}

			const online: unknown = typeof globalThis.navigator === "undefined" ? undefined : globalThis.navigator.onLine;
			if (online === false) {
				// 浏览器明确报告离线时优先展示离线提示，不再使用普通网关错误覆盖它。
				if (options.showErrorMessage) fastAxios.message.error(fastAxios.errorCode["offLine"] ?? fastAxios.t("offLine"));
				throw error;
			}

			const customError = await fastAxios.interceptors.responseError(error, options);
			if (customError !== null && customError !== undefined) {
				// Fast 项目可以替换错误；非 Error 返回值统一包装，保证调用方 catch 始终收到错误对象。
				if (customError instanceof Error) throw customError;
				throw new AxiosError(normalizeMessage(customError) ?? fastAxios.t("invalidCustomError"), AxiosError.ERR_BAD_RESPONSE);
			}

			// 未被自定义错误处理器接管时，按开关展示统一 HTTP/网络错误信息。
			if (options.showErrorMessage) fastAxios.message.error(await httpErrorStatusHandle(error));
			throw error;
		}
	);

	// 响应拦截器已经完成业务转换；这里仅收窄 Axios 条件返回类型，直接把原请求 Promise 返回给调用方。
	try {
		return (await instance<unknown, Output, Input>(options)) as Output;
	} finally {
		removePendingRequest(pendingKey, pendingCancel);
		closeLoading();
	}
};

export const axiosUtil = {
	/**
	 * 按 Fast 项目请求约定发起请求。
	 *
	 * 调用前必须先执行 `createFastAxios()` 初始化全局配置容器。
	 */
	request: createAxios,
	/**
	 * 在浏览器中保存已有 Axios 文件响应。
	 *
	 * uni-app 不执行 DOM 下载，下载结果应直接读取 adapter 响应中的临时文件路径。
	 */
	downloadFile,
};

export type * from "./types/options";
export * from "./fastAxios";

export type { FastAxiosLocale, FastAxiosLocaleSource, FastAxiosMessageKey, FastAxiosTranslate } from "./locale";
