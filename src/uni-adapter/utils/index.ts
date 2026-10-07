import axios, { AxiosError, AxiosHeaders } from "axios";
import type { AxiosProgressEvent, AxiosResponse, InternalAxiosRequestConfig } from "axios";
import type { MethodType, UniNetworkRequestWithoutCallback, UniNetworkTask, UniProgressResult } from "../type";

/**
 * 根据 Axios method 判断当前请求应使用的 uni-app 网络 API。
 *
 * `upload` 和 `download` 是 Fast uni adapter 的文件任务标记；其他标准 HTTP method 均使用 `uni.request`。
 * 比较前统一转为小写，因此 Fast.NET 生成的小写值和调用方传入的大写值具有相同行为。
 *
 * @param config - Axios 传给 adapter 的内部请求配置
 * @returns `upload`、`download`，或普通 HTTP 请求对应的 `request`
 */
export const getMethodType = (config: InternalAxiosRequestConfig): MethodType => {
	const method = (config.method ?? "GET").toLowerCase();
	if (method === "upload") return "upload";
	if (method === "download") return "download";
	return "request";
};

/**
 * 将 Axios 内部配置一次性转换为三个 uni-app 网络 API 可共用的请求选项。
 *
 * 此阶段只做确定性的配置映射，不注册回调、不创建任务，也不修改传入的 config。
 *
 * @param config - 已经过 Axios 默认值合并、请求拦截器和 transformRequest 的内部配置
 * @returns 包含最终 URL、纯对象请求头、转换后数据及全部 uni-app 平台选项的新对象
 * @throws AxiosError Basic Auth 无法编码时抛出 `ERR_BAD_OPTION_VALUE`，与 Axios 内建 adapter 行为一致。
 */
export const resolveUniAppRequestOptions = (config: InternalAxiosRequestConfig): UniNetworkRequestWithoutCallback => {
	// adapter 执行前 Axios 已运行 transformRequest，普通对象通常已变成 JSON 字符串；类型断言仅收窄到 uni 可接收的数据范围。
	const data = config.data as UniNamespace.RequestOptions["data"];
	// uni 只支持 text/arraybuffer；json、blob 等 Axios 类型先按 text 接收，再由 Axios transformResponse 处理。
	const responseType = config.responseType === "arraybuffer" ? "arraybuffer" : "text";
	// 文本响应默认让 uni 先尝试 JSON.parse；arraybuffer 必须关闭 dataType，避免平台错误解析二进制。
	const dataType = responseType === "text" ? (config.dataType ?? "json") : undefined;
	// 显式复制 AxiosHeaders；from() 会复用已有实例，导致 auth 和上传头处理修改原配置。
	const requestHeaders = new AxiosHeaders(config.headers).normalize(false);
	const methodType = getMethodType(config);
	if (methodType === "upload") {
		// transformRequest 会为对象 data 添加 application/json；uploadFile 必须自行生成 multipart/form-data 及 boundary。
		requestHeaders.delete("Content-Type");
	}

	if (config.auth) {
		const username = config.auth.username || "";
		const password = config.auth.password || "";
		// btoa 只接受单字节字符串；仅密码按 Axios 浏览器 adapter 的规则转换为 UTF-8 字节序列。
		const encodedPassword = password
			? encodeURIComponent(password).replace(/%([0-9A-F]{2})/gi, (_match, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)))
			: "";

		try {
			// 使用 set 覆盖已有 Authorization，保持 Axios `auth` 配置高于自定义请求头的语义。
			requestHeaders.set("Authorization", `Basic ${btoa(`${username}:${encodedPassword}`)}`);
		} catch (error) {
			// 不吞掉运行环境缺少 btoa 或凭据无法编码的错误，统一包装成可识别的 AxiosError。
			throw AxiosError.from(error, AxiosError.ERR_BAD_OPTION_VALUE, config);
		}
	}

	// 显式 formData 具有最高优先级；未提供时才尝试恢复被 transformRequest JSON.stringify 的 data。
	let formData = config.formData ?? {};
	if (config.formData === undefined && typeof data === "string") {
		try {
			const parsedData: unknown = JSON.parse(data);
			// uploadFile formData 必须是键值对象；数组、null 和原始值不能作为表单字段集合。
			if (parsedData && typeof parsedData === "object" && !Array.isArray(parsedData)) {
				formData = parsedData as Record<string, unknown>;
			}
		} catch {
			// data 允许是普通字符串，JSON 解析失败不是请求错误；此时不从 data 推导任何 formData 字段。
		}
	}

	return {
		// getUri 是 Axios 公共 API，可保持 baseURL、paramsSerializer、数组参数和 allowAbsoluteUrls 的官方行为。
		url: axios.getUri(config),
		data,
		// uni header 需要普通字符串对象，不能直接接收 AxiosHeaders 实例或字符串数组值。
		header: requestHeaders.toJSON(true),
		// upload/download 是 adapter 分流标记；构造平台参数时分别还原为文件 API 的默认 POST/GET 方法。
		method: (methodType === "upload"
			? "POST"
			: methodType === "download"
				? "GET"
				: (config.method ?? "GET").toUpperCase()) as UniNamespace.RequestOptions["method"],
		responseType,
		dataType,
		timeout: config.timeout, // 直接透传毫秒值；0 的最终含义由目标 uni 平台决定，adapter 不擅自改成固定超时。
		// 以下字段是 uni.request 及微信、支付宝等平台声明的扩展能力；undefined 由平台自然忽略。
		withCredentials: config.withCredentials,
		sslVerify: config.sslVerify,
		firstIpv4: config.firstIpv4,
		enableHttp2: config.enableHttp2,
		enableQuic: config.enableQuic,
		enableCache: config.enableCache,
		enableProfile: config.enableProfile,
		enableHttpDNS: config.enableHttpDNS,
		httpDNSServiceId: config.httpDNSServiceId,
		httpDNSTimeout: config.httpDNSTimeout,
		enableChunked: config.enableChunked,
		forceCellularNetwork: config.forceCellularNetwork,
		enableCookie: config.enableCookie,
		cloudCache: config.cloudCache,
		defer: config.defer,
		redirect: config.redirect,
		useHighPerformanceMode: config.useHighPerformanceMode,
		// 以下字段由 uploadFile/downloadFile 使用；展开到普通 request 时属于无副作用的额外属性。
		fileType: config.fileType,
		file: config.file,
		filePath: config.filePath,
		name: config.name,
		files: config.files,
		formData,
	};
};

/**
 * 把 uni `fail` 回调的任务错误转换为符合 Axios 约定的 AxiosError。
 *
 * 此函数不处理 HTTP 状态错误；uni 会把收到 4xx/5xx 的请求放在 success 回调，由 `settle` 负责判断。
 *
 * @param message - uni-app `fail` 返回的 errMsg；不同平台可能在固定前缀后追加详细文本。
 * @param config - 当前 Axios 内部请求配置，用于错误上下文和超时兼容选项。
 * @param task - 发生错误的任务实例；任务尚未赋值或已清理时可能为 null。
 * @returns 带标准 Axios code、config 和 request 上下文的 AxiosError
 */
export const createUniAppError = (message: string, config: InternalAxiosRequestConfig, task: UniNetworkTask | null): AxiosError => {
	// 平台错误文本大小写可能不同，统一转小写后使用包含判断，兼容 errMsg 后追加详细原因的情况。
	const normalizedMessage = message.toLowerCase();
	// Axios 默认把超时视为 ECONNABORTED；仅在 clarifyTimeoutError 开启时改用更明确的 ETIMEDOUT。
	const timeoutCode = config.transitional?.clarifyTimeoutError ? AxiosError.ETIMEDOUT : AxiosError.ECONNABORTED;
	const code = normalizedMessage.includes("timeout")
		? timeoutCode
		: normalizedMessage.includes("abort")
			? AxiosError.ECONNABORTED
			: AxiosError.ERR_NETWORK;
	// timeoutErrorMessage 只覆盖超时文本，不能掩盖文件读取、SSL 或其他网络错误原文。
	const errorMessage = normalizedMessage.includes("timeout") && config.timeoutErrorMessage ? config.timeoutErrorMessage : message;

	// errMsg 为空时仍提供稳定的 Network Error，避免调用方收到无消息的 AxiosError。
	return new AxiosError(errorMessage || "Network Error", code, config, task);
};

/**
 * 按 Axios `validateStatus` 规则结算已经转换为 AxiosResponse 的 uni 成功结果。
 *
 * 实现与 Axios 内部 settle 语义一致，但保留在本目录内，避免依赖未承诺稳定性的 `axios/unsafe/*` 路径。
 *
 * @param resolve - adapter Promise 的成功函数，通过校验时返回完整响应。
 * @param reject - adapter Promise 的拒绝函数，未通过校验时返回包含 response 的 AxiosError。
 * @param response - 已包含 status、headers、config 和原始 task 的 Axios 响应
 */
export const settle = (resolve: (response: AxiosResponse) => void, reject: (reason?: unknown) => void, response: AxiosResponse): void => {
	const { validateStatus } = response.config;
	// status 为 0/缺失或调用方明确移除 validateStatus 时，Axios 约定直接把响应视为成功。
	if (!response.status || !validateStatus || validateStatus(response.status)) {
		resolve(response);
		return;
	}

	// 4xx 使用 ERR_BAD_REQUEST；3xx、5xx 及其他未通过自定义校验的状态使用 ERR_BAD_RESPONSE。
	const code = response.status >= 400 && response.status < 500 ? AxiosError.ERR_BAD_REQUEST : AxiosError.ERR_BAD_RESPONSE;
	// 同时附加 config、原始 uni task 和 response，保持 AxiosError.toJSON 与错误拦截器可获取完整上下文。
	reject(new AxiosError(`Request failed with status code ${response.status}`, code, response.config, response.request, response));
};

/**
 * 将 uni-app 上传或下载进度统一转换为 AxiosProgressEvent。
 *
 * uni 上传使用 totalBytesSent，下载使用 totalBytesWritten；调用方只需要处理 Axios 的 loaded、total、rate 和 estimated。
 * Axios XHR adapter 的进度事件字段语义参考：
 * https://github.com/axios/axios/blob/7d45ab2e2ad6e59f5475e39afd4b286b1f393fc0/lib/adapters/xhr.js#L17-L44
 *
 * @param listener - Axios `onUploadProgress` 或 `onDownloadProgress`，每次 uni 进度通知调用一次。
 * @param type - 用于选择 `upload: true` 或 `download: true` 标记，不参与字节字段识别。
 * @returns 可注册到 UploadTask/DownloadTask `onProgressUpdate` 的回调
 */
export const progressEventReducer = (
	listener: (progressEvent: AxiosProgressEvent) => void,
	type: "download" | "upload"
): ((result: UniProgressResult) => void) => {
	// 保存上次累计字节和通知时间，用于计算本次增量 bytes 与即时 rate。
	let bytesNotified = 0;
	let notifiedAt = Date.now();

	return (result): void => {
		// 通过下载专有字段区分联合类型；否则按上传字段读取累计字节。
		const loaded = "totalBytesWritten" in result ? result.totalBytesWritten : result.totalBytesSent;
		const total = "totalBytesExpectedToWrite" in result ? result.totalBytesExpectedToWrite : result.totalBytesExpectedToSend;
		const bytes = loaded - bytesNotified;
		const now = Date.now();
		const elapsed = now - notifiedAt;
		// rate 单位为 bytes/s；同一毫秒内无法得到有效时间差，因此不报告速率。
		const rate = elapsed > 0 ? Math.round((bytes * 1000) / elapsed) : undefined;

		// 更新基线必须发生在 listener 之前，避免 listener 同步抛错导致下一次进度重复累计。
		bytesNotified = loaded;
		notifiedAt = now;

		// total 为 0 时总长度未知，progress/estimated 保持 undefined，lengthComputable 为 false。
		listener({
			loaded,
			total,
			progress: total > 0 ? loaded / total : undefined,
			bytes,
			rate,
			estimated: rate && total >= loaded ? (total - loaded) / rate : undefined, // 剩余秒数，仅在速率有效且未超出 total 时计算。
			event: result,
			lengthComputable: total > 0,
			[type]: true, // 与 Axios 浏览器 adapter 一致，标记事件来源是上传还是下载。
		});
	};
};
