/// <reference types="@dcloudio/types" />

/** adapter 内部的完整分流结果；upload/download 来自 Axios method，其他 method 统一归入 request。 */
export type MethodType = "request" | "download" | "upload";

/** 三种 uni-app 网络任务的联合类型；取消处理器只依赖它们共有的 `abort()` 能力。 */
export type UniNetworkTask = UniNamespace.RequestTask | UniNamespace.DownloadTask | UniNamespace.UploadTask;

/** 上传和下载 `onProgressUpdate` 的原始结果；工具函数负责把不同字段名统一为 Axios 进度结构。 */
export type UniProgressResult = UniNamespace.OnProgressDownloadResult | UniNamespace.OnProgressUpdateResult;

/**
 * 三个 uni-app 网络 API 共用的已解析请求选项
 *
 * 生命周期回调由具体执行器注入，避免调用方绕过 Axios Promise；header 已转换为纯字符串对象，formData 始终为对象。
 * 该交叉类型保留 request/upload/download 的平台扩展字段，使同一个解析结果可以安全展开到三种 uni API。
 */
export type UniNetworkRequestWithoutCallback = Omit<UniNamespace.RequestOptions, "success" | "fail" | "complete" | "header"> &
	Omit<UniNamespace.DownloadFileOption, "success" | "fail" | "complete" | "header"> &
	Omit<UniNamespace.UploadFileOption, "success" | "fail" | "complete" | "header" | "formData"> & {
		header: Record<string, string>;
		formData: Record<string, unknown>;
	};
