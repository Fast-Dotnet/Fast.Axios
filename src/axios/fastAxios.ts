import { defaultErrorMessages, resolveLocale, translateMessage } from "./locale";
import { CacheManage, CryptoManage, InterceptorsManage, LoadingManage, MessageBoxManage, MessageManage } from "./types";
import type { RawAxiosHeaders } from "axios";
import type { FastAxiosLocaleSource, FastAxiosMessageKey, FastAxiosTranslate } from "./locale";

/** `createFastAxios()` 和 `setOptions()` 支持的基础与国际化配置 */
type InitializeOptions = Partial<Pick<FastAxios, "baseUrl" | "timeout" | "headers" | "requestCipher" | "locale" | "translate">>;

/** 错误提示表允许同时使用 HTTP 数字状态码和 Axios/Fast 字符串错误码。 */
type CodeKeyType = string | number;

/**
 * Fast 请求的全局配置与扩展处理器容器
 *
 * 默认由 `createFastAxios()` 创建单例；消息、缓存、加密、Loading 和拦截器均可通过各自的 `.use()` 替换默认实现。
 */
class FastAxios {
	/** 当前模块使用的全局单例；独立实例不会写入该字段。 */
	static instance?: FastAxios;

	/**
	 * 创建配置与处理器容器。
	 *
	 * 类字段已经提供默认基础配置；构造函数先合并调用方配置，再初始化错误码和全部可替换处理器。
	 *
	 * @param options - 首次创建时需要覆盖的基础配置
	 */
	constructor(options: InitializeOptions = {}) {
		this.setOptions(options);

		// 默认错误表同时覆盖 Fast 业务提示、HTTP 状态、Axios 错误码和 uni.request 通用失败文本。
		this.errorCode = { ...defaultErrorMessages };
		for (const key of Object.keys(defaultErrorMessages) as (keyof typeof defaultErrorMessages)[]) {
			Object.defineProperty(this.errorCode, key, {
				enumerable: true,
				configurable: true,
				get: () => this.t(key),
				set: (value: string) => {
					// 显式赋值替换当前键的动态读取逻辑，保留 errorCode 和 addErrorCode 的既有可写合同。
					Object.defineProperty(this.errorCode, key, { value, writable: true, enumerable: true, configurable: true });
				},
			});
		}

		// 每个管理器都提供默认行为，并允许 Fast 项目通过 `.use()` 单独替换具体处理函数。
		this.loading = new LoadingManage();
		this.message = new MessageManage();
		this.messageBox = new MessageBoxManage((key) => this.t(key));
		this.cache = new CacheManage();
		this.crypto = new CryptoManage();
		this.interceptors = new InterceptorsManage();
	}

	/**
	 * 合并基础与国际化配置并返回当前实例。
	 *
	 * headers 按字段合并；其他已传入字段直接覆盖，未传入字段保持当前值。
	 *
	 * @param options - 需要更新的配置
	 */
	setOptions(options: InitializeOptions = {}): this {
		// 使用 undefined 判断，允许调用方显式设置空 baseURL、0 超时或 false。
		if (options.baseUrl !== undefined) {
			this._baseUrl = options.baseUrl;
		}

		if (options.timeout !== undefined) {
			this._timeout = options.timeout;
		}

		if (options.headers !== undefined) {
			// 多次设置时只覆盖同名请求头，保留此前注册的公共请求头。
			this._headers = { ...this._headers, ...options.headers };
		}

		if (options.requestCipher !== undefined) {
			this._requestCipher = options.requestCipher;
		}
		if (options.locale !== undefined) this.locale = options.locale;
		if (options.translate !== undefined) this.translate = options.translate;
		return this;
	}

	/** 当前 Axios 实例默认拼接的基础地址 */
	private _baseUrl = "";
	/** Axios 实例使用的 baseURL；允许为空字符串，单次请求仍可传入绝对 URL。 */
	get baseUrl(): string {
		return this._baseUrl;
	}

	/** 当前 Axios 实例使用的毫秒超时值 */
	private _timeout = 60000;
	/**
	 * 超时时间，单位毫秒
	 * @defaultValue `60000`
	 */
	get timeout(): number {
		return this._timeout;
	}

	/** 跨请求共享的公共请求头记录 */
	private _headers: RawAxiosHeaders = {};
	/** 创建 Axios 实例时注入的公共请求头；`setOptions()` 会按请求头名称合并更新。 */
	get headers(): RawAxiosHeaders {
		return this._headers;
	}

	/** 未被单次请求覆盖时采用的全局加解密开关 */
	private _requestCipher = true;
	/**
	 * 全局请求加密和响应解密开关；单次请求的 requestCipher 具有更高优先级。
	 * @defaultValue `true`
	 */
	get requestCipher(): boolean {
		return this._requestCipher;
	}

	/**
	 * SDK 文案语言
	 *
	 * 传入函数时，每次读取文案都会调用该函数；不支持的语言或读取异常均回退到简体中文。
	 *
	 * @defaultValue `"zh-CN"`
	 */
	locale: FastAxiosLocaleSource = "zh-CN";

	/**
	 * 应用翻译回调
	 *
	 * 设为 `null` 可恢复内建文案，不影响显式错误码覆盖。
	 *
	 * @defaultValue `null`
	 */
	translate: FastAxiosTranslate | null = null;

	/**
	 * 返回当前语言的 SDK 文案；翻译回调未提供译文或抛出异常时，使用内建文案。
	 *
	 * 此方法不读取 `addErrorCode()` 或直接赋值的覆盖；需要最终错误码提示时，应读取 `errorCode[code]`。
	 *
	 * @param key - SDK 内建文案键
	 */
	t(key: FastAxiosMessageKey): string {
		return translateMessage(key, resolveLocale(this.locale), this.translate);
	}

	/**
	 * 错误码提示表
	 *
	 * 内建键在读取时解析语言；显式赋值或 `addErrorCode()` 的覆盖优先，切换语言不会清除这些覆盖。
	 */
	readonly errorCode: Record<CodeKeyType, string>;

	/** Loading 处理器；并发请求的计数或队列策略由 Fast 项目注册的实现负责。 */
	readonly loading: LoadingManage;

	/** success/warning/info/error 消息处理器；默认输出到控制台。 */
	readonly message: MessageManage;

	/** 浏览器与 uni-app 确认框处理器 */
	readonly messageBox: MessageBoxManage;

	/** GET RESTful 简洁响应使用的缓存读写处理器 */
	readonly cache: CacheManage;

	/** 请求发送前加密和响应成功后解密处理器 */
	readonly crypto: CryptoManage;

	/** Fast 项目级请求、响应和响应错误处理器 */
	readonly interceptors: InterceptorsManage;

	/**
	 * 添加或覆盖单个错误码提示。
	 *
	 * @param key - HTTP 状态码、Axios error code 或 Fast 业务 code
	 * @param message - 展示给用户的错误提示
	 */
	addErrorCode(key: CodeKeyType, message: string): FastAxios;
	/**
	 * 批量添加或覆盖错误码提示。
	 *
	 * @param codes - 错误码到提示文字的映射
	 */
	addErrorCode(codes: Record<CodeKeyType, string>): FastAxios;

	addErrorCode(arg: CodeKeyType | Record<CodeKeyType, string>, message?: string): this {
		if (typeof arg === "string" || typeof arg === "number") {
			// 单值重载要求 key 和 message 同时存在；该检查也保护未经过 TypeScript 的 JavaScript 调用方。
			if (message === undefined) throw new TypeError("添加单个错误码时必须提供 message。");
			this.errorCode[arg] = message;
		} else {
			// 批量重载逐项覆盖同名错误码，不清空调用方此前注册的其他提示。
			for (const [key, value] of Object.entries(arg)) {
				this.errorCode[key] = value;
			}
		}
		return this;
	}
}

/**
 * 初始化 FastAxios 配置容器。
 *
 * 单例模式下重复调用会把本次 options 合并到现有实例；newInstance 为 true 时返回不写入全局单例的独立配置容器。
 * `axiosUtil.request()` 始终读取全局单例，独立容器不会自动参与该请求流程。
 *
 * @param options - 基础请求选项
 * @param newInstance - 是否返回独立配置容器，默认 `false`
 * @returns 全局单例或新创建的独立实例
 */
export const createFastAxios = (options?: InitializeOptions, newInstance = false): FastAxios => {
	if (newInstance) {
		// 独立容器只返回给当前调用方，不影响 `useFastAxios()` 获取的全局单例。
		return new FastAxios(options);
	}

	// 首次调用创建单例；后续调用复用原有处理器，只合并本次传入的基础配置。
	if (!FastAxios.instance) FastAxios.instance = new FastAxios(options);
	else FastAxios.instance.setOptions(options);

	return FastAxios.instance;
};

/**
 * 获取已经初始化的 FastAxios 全局单例。
 *
 * @throws Error 尚未调用 `createFastAxios()` 初始化单例时抛出。
 */
export const useFastAxios = (): FastAxios => {
	if (!FastAxios.instance) {
		// 请求主流程依赖已配置的全局容器，禁止静默创建缺少项目配置的隐式实例。
		throw new Error("请先调用 'createFastAxios' 初始化 'fast-axios'。");
	}

	return FastAxios.instance;
};
