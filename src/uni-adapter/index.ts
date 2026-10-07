import { Axios } from "axios";
import { getMethod } from "./methods";
import type { AxiosAdapter, AxiosRequestConfig, AxiosResponse } from "axios";

export type * from "./axios.type";

// 多次创建 Axios 实例时只安装一次，避免反复改写同一个 Axios 原型方法。
let convenienceMethodsInstalled = false;

/**
 * 创建用于 uni-app 运行环境的 Axios adapter，并安装文件上传、下载便捷方法。
 *
 * 每次请求根据 `config.method` 选择执行器：`upload` 和 `download` 分别调用文件 API，其他 method 调用 `uni.request`。
 * 首次调用时会为当前 Axios 包的原型安装 `upload()` 和 `download()`；后续调用只创建新的 adapter，不会重复安装。
 *
 * @returns 将 Axios 请求分发给 `uni.request`、`uni.uploadFile` 或 `uni.downloadFile` 的 adapter
 */
export const createUniAppAxiosAdapter = (): AxiosAdapter => {
	if (!convenienceMethodsInstalled) {
		/**
		 * 文件上传便捷方法，将 Axios 请求固定分流到 `uni.uploadFile`。
		 *
		 * @typeParam T - 服务端响应数据类型
		 * @typeParam R - 调用方需要的完整 Axios 响应类型
		 * @typeParam D - multipart 普通表单字段的数据类型
		 * @param url - 上传接口地址，支持 Axios `baseURL` 和参数序列化规则。
		 * @param data - 除文件外需要一并提交的普通表单字段
		 * @param config - 文件路径、字段名、请求头、进度回调及其他 Axios/uni-app 配置
		 * @returns 包含上传结果的 Axios Promise；HTTP 状态仍由 `validateStatus` 判断。
		 */
		Axios.prototype.upload = async function <T = unknown, R = AxiosResponse<T>, D = unknown>(
			url: string,
			data?: D,
			config?: AxiosRequestConfig<D>
		): Promise<R> {
			return this.request<T, R, D>({
				// 先展开调用方配置，再由便捷方法写入必须固定的上传字段。
				...config,
				// 方法参数的 url 和 data 优先于 config 中的同名字段，避免便捷方法请求错误的资源。
				url,
				data,
				// upload 是 adapter 的上传任务标记，必须放在 config 之后防止调用方覆盖分流结果。
				method: "upload",
			}) as Promise<R>;
		};

		/**
		 * 文件下载便捷方法，将 Axios 请求固定分流到 `uni.downloadFile`。
		 *
		 * @typeParam T - 下载成功后的响应数据类型，默认场景应为临时文件路径字符串。
		 * @typeParam R - 调用方需要的完整 Axios 响应类型
		 * @typeParam D - Axios 请求配置携带的数据类型
		 * @param url - 下载资源地址，支持 Axios `baseURL` 和参数序列化规则。
		 * @param config - 请求头、查询参数、进度回调及其他 Axios/uni-app 配置
		 * @returns Axios Promise；成功响应的 `data` 是 `uni.downloadFile` 返回的临时文件路径。
		 */
		Axios.prototype.download = async function <T = unknown, R = AxiosResponse<T>, D = unknown>(
			url: string,
			config?: AxiosRequestConfig<D>
		): Promise<R> {
			return this.request<T, R, D>({
				// 先展开调用方配置，再由便捷方法写入必须固定的下载字段。
				...config,
				// 方法参数的 url 优先于 config 中的同名字段，确保下载调用指向显式传入的资源。
				url,
				// download 是 adapter 的下载任务标记，必须放在 config 之后防止调用方覆盖分流结果。
				method: "download",
			}) as Promise<R>;
		};

		// 两个方法均安装完成后再更新标记，避免安装过程提前结束导致其中一个方法缺失。
		convenienceMethodsInstalled = true;
	}

	return async (config) => {
		// getMethod 只负责按 method 选择底层 API，原始 config 会完整交给执行器构造 AxiosResponse。
		const method = getMethod(config);
		return method(config);
	};
};
