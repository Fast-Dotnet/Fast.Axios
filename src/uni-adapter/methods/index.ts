import { getMethodType } from "../utils";
import download from "./download";
import request from "./request";
import upload from "./upload";
import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";

/**
 * 根据 `config.method` 选择且仅选择一个 uni-app 请求执行器。
 *
 * `upload` 和 `download` 分别表示文件任务，其他标准 HTTP method 统一交给 `uni.request`。
 *
 * @param config - Axios 完成默认值合并和 transformRequest 后交给 adapter 的内部配置
 * @returns 与当前任务类型对应的普通请求、上传或下载执行函数
 */
export const getMethod = (config: InternalAxiosRequestConfig): AxiosAdapter => {
	// getMethodType 会把非 upload/download 的 method 归一化为 request，因此 switch 始终有明确默认分支。
	const methodType = getMethodType(config);
	switch (methodType) {
		case "download":
			return download;
		case "request":
			return request;
		case "upload":
			return upload;
	}
};
