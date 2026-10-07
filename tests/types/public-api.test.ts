// 本文件只参与 TypeScript 编译，用于验证消费者可见的根入口、子路径和 Axios 类型扩展。
import {
	type ApiResponse,
	type FastAxiosRequestConfig,
	type RequestType,
	type UniAppRequestOptions,
	type UniAppUploadFile,
	axiosUtil,
	createFastAxios,
	createUniAppAxiosAdapter,
} from "@fast-china/axios";
import vitePlugin from "@fast-china/axios/vite";
import webpackPlugin from "@fast-china/axios/webpack";
import axios from "axios";
import type { AxiosAdapter, AxiosResponse } from "axios";

interface User {
	id: number;
	name: string;
}

interface CreateUserInput {
	name: string;
}

const requestType: RequestType = "query";
const uploadFiles: UniAppUploadFile[] = [{ name: "file", uri: "/tmp/avatar.png" }];
const uniOptions: UniAppRequestOptions = { enableHttp2: true, files: uploadFiles, redirect: "follow" };
const requestConfig: FastAxiosRequestConfig<CreateUserInput> = {
	url: "/users",
	method: "post",
	data: { name: "Fast" },
	requestType: "add",
};

const isolated = createFastAxios({ baseUrl: "https://api.example.com", requestCipher: false }, true);
isolated.interceptors.request.use((config) => {
	config.headers.set("X-Test", "public-api");
});
isolated.interceptors.response.use((_response) => undefined);

const requestResult: Promise<User> = axiosUtil.request<User, CreateUserInput>(requestConfig);
const adapter: AxiosAdapter = createUniAppAxiosAdapter();
const instance = axios.create({ adapter });
const uploadResult: Promise<AxiosResponse<ApiResponse<User>>> = instance.upload<ApiResponse<User>>(
	"/files/avatar",
	{ category: "avatar" },
	{ filePath: "/tmp/avatar.png", name: "file" }
);
const downloadResult: Promise<AxiosResponse<string>> = instance.download<string>("/files/export");

// @ts-expect-error Fast 请求必须声明与 Fast.NET 同步的 requestType。
const missingRequestType: FastAxiosRequestConfig = { url: "/users" };
// @ts-expect-error 未知业务类型不能绕过 RequestType 契约。
const unsupportedRequestType: RequestType = "paged";

export {
	downloadResult,
	missingRequestType,
	requestResult,
	requestType,
	uniOptions,
	unsupportedRequestType,
	uploadResult,
	vitePlugin,
	webpackPlugin,
};
