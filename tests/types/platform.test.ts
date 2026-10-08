/// <reference types="@dcloudio/types" />

import type { UniAppRequestOptions, UniAppUploadFile, createFastAxios } from "@fast-china/axios";
import type { AxiosHeaderValue, AxiosRequestConfig } from "axios";
import type OnCanceled from "../../src/uni-adapter/methods/onCanceled";
import type { UniNetworkTask } from "../../src/uni-adapter/type";
import type { progressEventReducer } from "../../src/uni-adapter/utils";

// 这些断言只参与编译，验证平台中立的公共投影与原生类型双向兼容。
type IsEquivalent<Left, Right> = [Left] extends [Right] ? ([Right] extends [Left] ? true : false) : false;
type Assert<Value extends true> = Value;
type UploadFields = Pick<UniNamespace.UploadFileOption, "fileType" | "file" | "filePath" | "name" | "files">;
type RequestFields = Pick<UniNamespace.RequestOptions, keyof Omit<UniAppRequestOptions, keyof UploadFields>>;

export type NativeTypeContracts = [
	Assert<IsEquivalent<UniAppRequestOptions, RequestFields & UploadFields>>,
	Assert<IsEquivalent<UniAppUploadFile, UniNamespace.UploadFileOptionFiles>>,
	Assert<IsEquivalent<ReturnType<typeof createFastAxios>["headers"], Record<string, AxiosHeaderValue>>>,
	Assert<IsEquivalent<Parameters<typeof progressEventReducer>[0], NonNullable<AxiosRequestConfig["onDownloadProgress"]>>>,
	Assert<IsEquivalent<Parameters<OnCanceled["subscribe"]>[0], Pick<UniNetworkTask, "abort">>>,
];

// 取消处理器只需要 abort，不要求调用方实现与取消无关的监听方法。
export const abortableTask: Parameters<OnCanceled["subscribe"]>[0] = {
	abort() {
		return;
	},
};

// @ts-expect-error uni-app 文件类型仍限制为 audio、image、video
export const unsupportedFileType: UniAppRequestOptions = { fileType: "document" };
// @ts-expect-error 多文件 URI 必须是字符串
export const unsupportedUploadFile: UniAppUploadFile = { uri: 123 };
