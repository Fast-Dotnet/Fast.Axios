import { AxiosHeaders } from "axios";
import { createUniAppError, progressEventReducer, resolveUniAppRequestOptions, settle } from "../utils";
import OnCanceled from "./onCanceled";
import type { AxiosAdapter, AxiosResponse } from "axios";

/**
 * 使用 `uni.downloadFile` 执行 `method: "download"` 请求。
 *
 * 成功响应的 `data` 是临时文件路径，不是文件二进制内容；文件生命周期由 uni-app 平台管理。
 */
const download: AxiosAdapter = async (config) => {
	return new Promise<AxiosResponse>((resolve, reject) => {
		// 下载仍复用 Axios 的 baseURL、params、headers、auth 和 timeout，再转换为 downloadFile 选项。
		const requestOptions = resolveUniAppRequestOptions(config);
		// 每个下载任务独立管理取消监听，避免并发下载相互中止。
		const onCanceled = new OnCanceled(config);
		// 闭包中的 task 用于响应 request 字段、进度监听和取消；null 表示该 Promise 已完成结算。
		let task: UniNamespace.DownloadTask | null = null;

		// 回调由 adapter 独占，调用方统一从 Axios Promise 获取成功或错误结果。
		task = uni.downloadFile({
			...requestOptions,
			success(result: UniNamespace.DownloadSuccessData) {
				// 忽略任务结算后平台可能补发的迟到回调。
				if (!task) return;

				// downloadFile 只返回临时文件路径与状态码，没有可映射的响应体和响应头。
				const response: AxiosResponse = {
					config,
					data: result.tempFilePath,
					headers: new AxiosHeaders(), // uni.downloadFile 的成功回调不提供响应头。
					status: result.statusCode,
					statusText: "", // uni.downloadFile 不提供 HTTP reason phrase。
					request: task,
				};
				// uni success 也可能携带 4xx/5xx，必须继续执行 Axios validateStatus。
				settle(resolve, reject, response);
				// 防止同一下载任务被重复结算。
				task = null;
			},
			fail(error: UniNamespace.GeneralCallbackResult) {
				// 超时、中止和网络异常属于任务错误，统一转换为带上下文的 AxiosError。
				reject(createUniAppError(error.errMsg, config, task));
				task = null;
			},
			complete() {
				// complete 是所有终止路径都会经过的清理点；这里只移除取消监听，不改变 Promise 结果。
				onCanceled.unsubscribe();
			},
		});

		// uni 使用 totalBytesWritten 等字段，先转换为 AxiosProgressEvent 再通知调用方。
		if (typeof config.onDownloadProgress === "function") {
			task.onProgressUpdate(progressEventReducer(config.onDownloadProgress, "download"));
		}

		// onHeadersReceived 属于 DownloadTask 实例方法，必须在 uni.downloadFile 返回 task 后注册。
		if (config.onHeadersReceived) task.onHeadersReceived(config.onHeadersReceived);

		// 最后连接 Axios 取消源；此时进度和响应头监听已经就绪，取消不会留下未清理的注册过程。
		onCanceled.subscribe(task, reject);
	});
};

export default download;
