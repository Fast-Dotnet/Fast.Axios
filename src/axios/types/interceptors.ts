import type { AxiosError, AxiosResponse, InternalAxiosRequestConfig } from "axios";
import type { FastAxiosRequestConfig } from "./options";

/** Fast 项目级请求前置处理函数；支持异步，完成后才执行缓存、去重和发送。 */
type InterceptorsRequestHandle = <Input = unknown>(config: InternalAxiosRequestConfig<Input>) => void | Promise<void>;
/** 为请求前置处理函数附加实现替换入口。 */
interface InterceptorsRequestUseHandle {
	/** 使用新的请求前置处理函数替换当前实现。 */
	use: (fn: InterceptorsRequestHandle) => void;
}
/** Fast 项目级响应成功处理函数；返回值可接管默认业务响应处理。 */
type InterceptorsResponseHandle = <Output = unknown, Input = unknown>(
	response: AxiosResponse<Output, Input>,
	options: FastAxiosRequestConfig<Input>
) => unknown;
/** 为响应成功处理函数附加实现替换入口。 */
interface InterceptorsResponseUseHandle {
	/** 使用新的响应成功处理函数替换当前实现。 */
	use: (fn: InterceptorsResponseHandle) => void;
}
/** Fast 项目级响应失败处理函数；返回值可替换最终抛出的错误。 */
type InterceptorsResponseErrorHandle = <Input = unknown>(error: AxiosError<unknown, Input>, options: FastAxiosRequestConfig<Input>) => unknown;
/** 为响应失败处理函数附加实现替换入口。 */
interface InterceptorsResponseErrorUseHandle {
	/** 使用新的响应失败处理函数替换当前实现。 */
	use: (fn: InterceptorsResponseErrorHandle) => void;
}

/**
 * Fast 项目级请求处理器，不替代 Axios 实例自己的拦截器链。
 *
 * 每类处理器只保留一个当前实现；重复调用 `.use()` 会用新函数替换旧函数。
 * 请求流程会等待三类处理器；响应处理器的 Promise 解析为 null/undefined 时继续默认处理，拒绝时向调用方传播。
 */
export class InterceptorsManage {
	/** 当前实际执行的三个项目级处理函数 */
	private readonly _handle: {
		request: InterceptorsRequestHandle;
		response: InterceptorsResponseHandle;
		responseError: InterceptorsResponseErrorHandle;
	};

	/** 请求发送前执行，可直接修改 config。 */
	readonly request: InterceptorsRequestHandle & InterceptorsRequestUseHandle;
	/** 响应成功后优先执行；返回非 null/undefined 时替换默认响应处理结果。 */
	readonly response: InterceptorsResponseHandle & InterceptorsResponseUseHandle;
	/** Axios 请求失败后执行；返回非 null/undefined 时作为新的错误继续抛出。 */
	readonly responseError: InterceptorsResponseErrorHandle & InterceptorsResponseErrorUseHandle;

	/** 创建默认不接管 Axios 请求与响应结果的项目级处理器。 */
	constructor() {
		this._handle = {
			// 默认不修改请求配置。
			request: <Input = unknown>(_config: InternalAxiosRequestConfig<Input>): void => {
				return;
			},
			// undefined 表示继续执行内置的 RESTful、解密和缓存流程。
			response: <Output = unknown, Input = unknown>(
				_response: AxiosResponse<Output, Input>,
				_options: FastAxiosRequestConfig<Input>
			): unknown => undefined,
			// undefined 表示保留 Axios 原始错误，由主流程统一进行错误提示与抛出。
			responseError: <Input = unknown>(_error: AxiosError<unknown, Input>, _options: FastAxiosRequestConfig<Input>): unknown => undefined,
		};

		// 对外函数引用保持不变，每次调用都转发给最新注册的请求处理函数。
		const requestProxy: InterceptorsRequestHandle & InterceptorsRequestUseHandle = <Input = unknown>(
			config: InternalAxiosRequestConfig<Input>
		): void | Promise<void> => {
			return this._handle.request(config);
		};
		// 重复调用 use() 时以最后一次注册的函数为准，不叠加执行链。
		requestProxy.use = (fn: InterceptorsRequestHandle): void => {
			this._handle.request = fn;
		};
		this.request = requestProxy;

		// 响应代理保留处理器返回值，供主流程判断是否接管默认响应处理。
		const responseProxy: InterceptorsResponseHandle & InterceptorsResponseUseHandle = <Output = unknown, Input = unknown>(
			response: AxiosResponse<Output, Input>,
			options: FastAxiosRequestConfig<Input>
		): unknown => {
			// 返回用户处理结果，让请求主流程可以按约定替换默认响应。
			return this._handle.response(response, options);
		};
		// 只替换成功响应处理函数，不影响请求和失败响应处理函数。
		responseProxy.use = (fn: InterceptorsResponseHandle): void => {
			this._handle.response = fn;
		};
		this.response = responseProxy;

		// 失败响应代理同样必须把自定义处理结果返回给请求主流程。
		const responseErrorProxy: InterceptorsResponseErrorHandle & InterceptorsResponseErrorUseHandle = <Input = unknown>(
			error: AxiosError<unknown, Input>,
			options: FastAxiosRequestConfig<Input>
		): unknown => {
			// 错误处理器的返回值由请求主流程继续 reject，不能在代理层静默丢弃。
			return this._handle.responseError(error, options);
		};
		// 只替换失败响应处理函数；未注册时仍使用上方的 undefined 默认实现。
		responseErrorProxy.use = (fn: InterceptorsResponseErrorHandle): void => {
			this._handle.responseError = fn;
		};
		this.responseError = responseErrorProxy;
	}
}
