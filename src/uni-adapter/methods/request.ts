import { AxiosHeaders } from "axios";
import { createUniAppError, resolveUniAppRequestOptions, settle } from "../utils";
import OnCanceled from "./onCanceled";
import type { AxiosAdapter, AxiosResponse } from "axios";

/**
 * 使用 `uni.request` 执行 method 不是 `upload` 或 `download` 的标准 HTTP 请求。
 *
 * uni 的 success 只表示网络任务完成，包含 4xx/5xx；HTTP 状态是否成功仍由 Axios `validateStatus` 决定。
 */
const request: AxiosAdapter = async (config) => {
	return new Promise<AxiosResponse>((resolve, reject) => {
		// 解析发生在创建任务之前，确保同步配置错误直接拒绝 adapter Promise，而不是进入 uni 回调。
		const requestOptions = resolveUniAppRequestOptions(config);
		// 每个请求独立持有取消处理器，complete 时只清理本次请求注册的监听器。
		const onCanceled = new OnCanceled(config);
		// 闭包中的 task 同时用于响应 request 字段和取消 abort；置空后表示该 Promise 已完成结算。
		let task: UniNamespace.RequestTask | null = null;

		// 回调由 adapter 独占，调用方只能通过 Axios Promise 和拦截器观察请求结果。
		task = uni.request({
			...requestOptions,
			success(result: UniNamespace.RequestSuccessCallbackResult) {
				// 某些平台可能重复触发回调；已置空时忽略迟到结果，避免重复构造响应。
				if (!task) return;

				// 标准平台返回单个 header 对象；钉钉 Android 返回对象数组，需要先按出现顺序合并。
				const rawHeaders = result.header as unknown as Record<string, string> | Record<string, string>[];
				const responseHeaders = Array.isArray(rawHeaders)
					? rawHeaders.reduce<Record<string, string>>((headers, item) => Object.assign(headers, item), {})
					: rawHeaders;
				const response: AxiosResponse = {
					config,
					data: result.data,
					headers: new AxiosHeaders(responseHeaders),
					status: result.statusCode,
					statusText: "", // uni.request 不提供 HTTP reason phrase，不能使用任务 errMsg 冒充。
					request: task,
					cookies: result.cookies,
				};
				// 这里只做 adapter 层结算；Axios 会在 Promise 返回后继续执行 transformResponse 和响应拦截器。
				settle(resolve, reject, response);
				// 标记任务已结算，使后续异常回调无法再次处理同一请求。
				task = null;
			},
			fail(error: UniNamespace.GeneralCallbackResult) {
				// fail 只代表超时、中止、SSL 或网络等任务错误；HTTP 4xx/5xx 不会进入此分支。
				reject(createUniAppError(error.errMsg, config, task));
				task = null;
			},
			complete() {
				// complete 在 success/fail 之后统一触发，是释放 CancelToken 和 AbortSignal 监听器的唯一出口。
				onCanceled.unsubscribe();
			},
		});

		// onHeadersReceived 是 RequestTask 方法而非 RequestOptions 回调，必须在拿到 task 后注册。
		if (config.onHeadersReceived) task.onHeadersReceived(config.onHeadersReceived);

		// 最后连接 Axios 取消源与已创建的任务，取消时才能调用这个具体 task 的 abort()。
		onCanceled.subscribe(task, reject);
	});
};

export default request;
