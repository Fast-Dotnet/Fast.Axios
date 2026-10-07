// 显式导入 Axios，使下方 declare module 始终是模块扩展，不能被声明打包器降级为新的 ambient module。
import "axios";

/**
 * uni-app 多文件上传中的单个文件描述。
 *
 * 该公共类型只描述 adapter 实际透传的稳定字段，不要求普通浏览器消费者安装完整的 uni-app 全局类型包。
 */
export interface UniAppUploadFile {
	/** multipart 字段名；多个文件使用相同名称时，部分服务端只会读取其中一个文件。 */
	name?: string;
	/** App 平台可直接上传的 File 对象。 */
	file?: File;
	/** 文件本地 URI 或路径。 */
	uri?: string;
}

/**
 * adapter 支持透传给 uni-app 网络 API 的平台扩展字段。
 *
 * URL、data、header、method、timeout 和生命周期回调继续由 Axios 负责；这里只声明 Axios 本身没有提供的字段。
 * 公开声明保留平台中立的字段投影，避免消费者依赖全局 UniNamespace；类型测试核对这些字段与原生声明一致。
 */
export interface UniAppRequestOptions {
	/** uni.request 的响应解析类型；文本请求默认使用 json。 */
	dataType?: string;
	/** 是否验证 SSL 证书。 */
	sslVerify?: boolean;
	/** DNS 解析时是否优先使用 IPv4。 */
	firstIpv4?: boolean;
	/** 是否启用 HTTP/2。 */
	enableHttp2?: boolean;
	/** 是否启用 QUIC。 */
	enableQuic?: boolean;
	/** 是否启用目标小程序平台的请求缓存。 */
	enableCache?: boolean;
	/** 是否输出微信小程序网络性能信息。 */
	enableProfile?: boolean;
	/** 是否启用微信小程序 HttpDNS。 */
	enableHttpDNS?: boolean;
	/** HttpDNS 服务商 ID。 */
	httpDNSServiceId?: string;
	/** HttpDNS 查询超时，单位毫秒。 */
	httpDNSTimeout?: number;
	/** 是否启用 Transfer-Encoding chunked。 */
	enableChunked?: boolean;
	/** Wi-Fi 环境下是否强制使用蜂窝网络。 */
	forceCellularNetwork?: boolean;
	/** 是否允许目标平台在 header 中编辑 Cookie。 */
	enableCookie?: boolean;
	/** 百度小程序云加速配置。 */
	cloudCache?: object | boolean;
	/** 是否把请求延迟到首屏渲染完成后发送。 */
	defer?: boolean;
	/** 重定向处理方式。 */
	redirect?: "follow" | "manual";
	/** 是否启用微信小程序高性能网络模式。 */
	useHighPerformanceMode?: boolean;
	/** 支付宝小程序上传文件类型。 */
	fileType?: "audio" | "image" | "video";
	/** App 平台可直接上传的 File 对象。 */
	file?: File;
	/** 单文件上传的本地文件路径。 */
	filePath?: string;
	/** 单文件上传对应的 multipart 字段名。 */
	name?: string;
	/** 多文件上传列表。 */
	files?: UniAppUploadFile[];
}

declare module "axios" {
	/** 为 Axios 请求配置补充 uni-app 平台选项。 */
	export interface AxiosRequestConfig extends UniAppRequestOptions {
		/**
		 * 传给 `uni.uploadFile` 的 multipart 普通表单字段。
		 *
		 * 仅在 `method: "upload"` 时生效；显式设置后不再从 Axios `data` 推导表单字段。
		 */
		formData?: Record<string, unknown>;

		/**
		 * 监听 uni 网络任务收到的原始响应头事件。
		 *
		 * adapter 在任务创建后调用 `task.onHeadersReceived` 注册；不支持该任务能力的平台不会产生事件。
		 */
		onHeadersReceived?: (result: { header: Record<string, string> }) => void;
	}

	/** 为 Axios 响应补充 `uni.request` 成功回调特有的数据。 */
	export interface AxiosResponse {
		/** `uni.request` 返回的 Cookie 字符串数组；上传和下载响应不设置此字段。 */
		cookies?: string[];
	}

	/**
	 * 为使用当前 Axios 包创建的实例补充 uni-app 文件任务便捷方法。
	 *
	 * 运行时方法由 `createUniAppAxiosAdapter()` 首次调用时安装；普通 Axios 请求 API 不受影响。
	 */
	export interface Axios {
		/**
		 * 使用 `uni.uploadFile` 上传文件。
		 *
		 * `data` 作为普通 multipart 表单字段，`config` 提供 filePath、name、files 等文件选项；内部固定使用 `method: "upload"`。
		 */
		upload<T = unknown, R = AxiosResponse<T>, D = unknown>(url: string, data?: D, config?: AxiosRequestConfig<D>): Promise<R>;

		/**
		 * 使用 `uni.downloadFile` 下载文件。
		 *
		 * 内部固定使用 `method: "download"`；成功后 `response.data` 是 uni-app 返回的临时文件路径。
		 */
		download<T = unknown, R = AxiosResponse<T>, D = unknown>(url: string, config?: AxiosRequestConfig<D>): Promise<R>;
	}
}
