import type { AxiosRequestConfig, AxiosResponse } from "axios";

/**
 * Fast.NET RESTful 接口的标准响应结构。
 *
 * 字段保持可选，以支持无响应体、文件响应以及部分接口只返回 code/message 的场景。
 */
export interface ApiResponse<Output = unknown, Input = unknown> {
	/**
	 * 业务执行结果；显式为 false 时，即使 HTTP/code 成功也按业务错误处理。
	 */
	success?: boolean;
	/**
	 * Fast 业务状态码；未返回时使用 HTTP status 参与成功判断。
	 */
	code?: number;
	/**
	 * 业务提示内容；允许对象，由消息处理流程安全序列化后展示。
	 */
	message?: unknown;
	/**
	 * 接口业务数据；开启 simpleDataFormat 后直接作为请求结果返回。
	 */
	data?: Output;
	/**
	 * 服务端生成响应时的时间戳。
	 */
	timestamp?: number;
	/**
	 * 服务端可选附带的原始响应信息，不等同于当前客户端收到的 AxiosResponse。
	 */
	response?: AxiosResponse<Output, Input>;
}

/**
 * Fast.NET OpenAPI 最终生成的业务请求类型。
 *
 * 与 `HttpRequestActionEnum` 经 `OpenApiUtil.DisposeRequestAction()` 转换后的字符串严格同步：
 * `Paged`/`Query` 统一为 `query`，`None`/`Notify`/`Other` 统一为 `other`。
 * `download`/`export` 进入文件响应流程；`upload` 和其余值保留为 Fast 业务分类。
 * uni adapter 是否调用文件 API 仍由 `method: "upload" | "download"` 决定。
 */
export type RequestType =
	"auth" | "query" | "add" | "edit" | "delete" | "submit" | "upload" | "download" | "export" | "import" | "callback" | "other";

/**
 * Fast 请求流程在 AxiosRequestConfig 之外识别的扩展选项。
 */
export interface AxiosOptions {
	/**
	 * 是否取消相同 URL、Method、参数和请求体的上一条未完成请求。
	 * @defaultValue true
	 */
	cancelDuplicateRequest?: boolean;
	/**
	 * 是否在请求生命周期内调用全局 Loading 的 show/close 处理器。
	 * @defaultValue false
	 */
	loading?: boolean;
	/**
	 * 传给 Loading show 处理器的提示文字。
	 * @defaultValue '加载中...'
	 */
	loadingText?: string;
	/**
	 * 是否读取和写入请求缓存；仅 GET + RESTful + simpleDataFormat 且已设置缓存命名空间时生效。
	 * @defaultValue false
	 */
	cache?: boolean;
	/**
	 * 未启用请求加密时，为 GET 参数追加时间戳以绕过浏览器或代理缓存。
	 * @defaultValue true
	 */
	getMethodCacheHandle?: boolean;
	/**
	 * 是否从 Fast RESTful 响应中直接返回 `data` 字段。
	 *
	 * 只对 JSON + RESTful 响应执行拆包；文件和其他响应类型保持各自返回结构。
	 * @defaultValue true
	 */
	simpleDataFormat?: boolean;
	/**
	 * 是否通过 Message error 处理器展示 HTTP、网络和超时错误。
	 * @defaultValue true
	 */
	showErrorMessage?: boolean;
	/**
	 * 是否展示 Fast RESTful 业务错误信息。
	 *
	 * code 不在 200-299 或 success 为 false 时触发。
	 * @defaultValue true
	 */
	showCodeMessage?: boolean;
	/**
	 * 是否在浏览器收到 download/export 或 Blob 响应后自动保存文件。
	 *
	 * uni-app 不执行浏览器保存逻辑，调用方从响应 data 获取临时文件路径。
	 * @defaultValue true
	 */
	autoDownloadFile?: boolean;
	/**
	 * 是否启用请求加密和响应解密，优先级高于 `createFastAxios().requestCipher`。
	 * 未设置时继承全局配置，不在此声明独立默认值。
	 */
	requestCipher?: boolean;
	/**
	 * 是否按 `ApiResponse` 结构校验业务 code/success 并处理 data。
	 * @defaultValue true
	 */
	restfulResult?: boolean;
}

export interface FastAxiosRequestConfig<Input = unknown> extends AxiosRequestConfig<Input>, AxiosOptions {
	/**
	 * 本次请求的缓存命名空间
	 *
	 * 未指定时使用 cache.namespace；两者均为空则跳过缓存。应包含账号、租户、语言或 Cookie 会话版本，不能使用明文凭据。
	 */
	cacheNamespace?: string;
	/**
	 * 不透明请求体的显式去重标识
	 *
	 * 文件、流和循环对象默认不自动去重；设置后由调用方保证相同标识表示相同操作。不可使用密码或令牌。
	 */
	duplicateKey?: string;
	/**
	 * Fast.NET OpenAPI 生成的业务请求类型。
	 *
	 * 该字段用于 Fast 业务响应处理；uni adapter 的文件任务仍由 `method: "upload" | "download"` 选择。
	 * `download`/`export` 在浏览器未指定 responseType 时默认接收 Blob。
	 */
	requestType: RequestType;
}
