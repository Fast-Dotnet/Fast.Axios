import { AxiosHeaders } from "axios";
import { createUniAppError, progressEventReducer, resolveUniAppRequestOptions, settle } from "../utils";
import OnCanceled from "./onCanceled";
import type { AxiosAdapter, AxiosResponse } from "axios";

/**
 * 使用 `uni.uploadFile` 执行 `method: "upload"` 请求。
 *
 * Axios `data` 在配置解析阶段恢复为普通 formData；文件本身由 filePath/file/files 与 name 等 uni 选项描述。
 */
const upload: AxiosAdapter = async (config) => {
	return new Promise<AxiosResponse>((resolve, reject) => {
		// 解析阶段会删除 Axios 自动添加的 JSON Content-Type，让 uni.uploadFile 生成正确的 multipart boundary。
		const requestOptions = resolveUniAppRequestOptions(config);
		// 每个上传任务独立管理取消监听，避免多个并发上传共享回调引用。
		const onCanceled = new OnCanceled(config);
		// 闭包中的 task 用于响应 request 字段、进度监听和取消；null 表示该 Promise 已完成结算。
		let task: UniNamespace.UploadTask | null = null;

		// success/fail/complete 由 adapter 接管，保证上传结果始终按 Axios Promise 语义返回。
		task = uni.uploadFile({
			...requestOptions,
			success(result: UniNamespace.UploadFileSuccessCallbackResult) {
				// 忽略任务结算后平台可能补发的迟到回调。
				if (!task) return;

				// uploadFile 固定返回字符串 data；这里保持原值，让 Axios transformResponse 决定是否解析 JSON。
				const response: AxiosResponse = {
					config,
					data: result.data,
					headers: new AxiosHeaders(result.header),
					status: result.statusCode,
					statusText: "", // uni.uploadFile 不提供 HTTP reason phrase。
					request: task,
				};
				// uni success 也可能携带 4xx/5xx，必须继续执行 Axios validateStatus。
				settle(resolve, reject, response);
				// 防止同一上传任务被重复结算。
				task = null;
			},
			fail(error: UniNamespace.GeneralCallbackResult) {
				// 文件读取、超时、中止和网络异常都属于任务错误，统一转换为 AxiosError。
				reject(createUniAppError(error.errMsg, config, task));
				task = null;
			},
			complete() {
				// complete 是所有终止路径都会经过的清理点；这里只移除取消监听，不改变 Promise 结果。
				onCanceled.unsubscribe();
			},
		});

		// uni 使用 totalBytesSent 等字段，先转换为 AxiosProgressEvent 再通知调用方。
		if (typeof config.onUploadProgress === "function") {
			task.onProgressUpdate(progressEventReducer(config.onUploadProgress, "upload"));
		}

		// onHeadersReceived 属于 UploadTask 实例方法，必须在 uni.uploadFile 返回 task 后注册。
		if (config.onHeadersReceived) task.onHeadersReceived(config.onHeadersReceived);

		// 最后连接 Axios 取消源；此时进度和响应头监听已经就绪，取消不会留下未清理的注册过程。
		onCanceled.subscribe(task, reject);
	});
};

export default upload;
