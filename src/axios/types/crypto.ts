import type { AxiosResponse, InternalAxiosRequestConfig } from "axios";
import type { FastAxiosRequestConfig } from "./options";

/** 请求发送前的加密处理函数，可直接修改 Axios 请求配置。 */
type CryptoEncryptHandle = <Input>(config: InternalAxiosRequestConfig<Input>, timestamp: number) => void;
/** 为请求加密函数附加实现替换入口。 */
interface CryptoEncryptUseHandle {
	/** 使用新的请求加密函数替换当前实现。 */
	use: (fn: CryptoEncryptHandle) => void;
}
/** 响应成功后的解密处理函数，返回值会进入后续业务响应处理流程。 */
type CryptoDecryptHandle = <Output = unknown, Input = unknown>(
	response: AxiosResponse<Output, Input>,
	options: FastAxiosRequestConfig<Input>
) => unknown;
/** 为响应解密函数附加实现替换入口。 */
interface CryptoDecryptUseHandle {
	/** 使用新的响应解密函数替换当前实现。 */
	use: (fn: CryptoDecryptHandle) => void;
}

/**
 * Fast 项目的请求加密和响应解密处理器
 *
 * 默认实现保持数据不变；注册函数可直接修改请求 config，并应从 decrypt 返回后续流程需要处理的完整响应体。
 */
export class CryptoManage {
	/** 当前实际执行的加密与解密函数；`.use()` 只替换对应成员。 */
	private readonly _handle: {
		encrypt: CryptoEncryptHandle;
		decrypt: CryptoDecryptHandle;
	};

	/** 请求发送前执行；`.use(fn)` 会替换默认加密实现。 */
	readonly encrypt: CryptoEncryptHandle & CryptoEncryptUseHandle;
	/** RESTful 校验后执行并返回响应体；`.use(fn)` 会替换默认解密实现。 */
	readonly decrypt: CryptoDecryptHandle & CryptoDecryptUseHandle;

	/** 创建默认不加密、解密时原样返回响应数据的处理器。 */
	constructor() {
		this._handle = {
			// 默认加密器不修改请求；Fast 项目可通过 encrypt.use() 接入自己的签名或加密协议。
			encrypt: <Input>(_config: InternalAxiosRequestConfig<Input>, _timestamp: number): void => {
				return;
			},
			// 默认解密器必须返回原始响应体，避免开启 requestCipher 后把正常 JSON 覆盖为 null。
			decrypt: <Output = unknown, Input = unknown>(response: AxiosResponse<Output, Input>, _options: FastAxiosRequestConfig<Input>): unknown =>
				response.data,
		};

		// 代理函数保持对外引用稳定，并把每次调用转发给最新注册的加密实现。
		const encryptProxy: CryptoEncryptHandle & CryptoEncryptUseHandle = <Input>(
			config: InternalAxiosRequestConfig<Input>,
			timestamp: number
		): void => {
			this._handle.encrypt<Input>(config, timestamp);
		};
		// 后续请求使用新实现；已经创建的 Axios 实例无需重新注册处理器。
		encryptProxy.use = (fn: CryptoEncryptHandle): void => {
			this._handle.encrypt = fn;
		};
		this.encrypt = encryptProxy;

		// 解密结果必须向上返回，主流程会继续执行缓存与 RESTful 响应解析。
		const decryptProxy: CryptoDecryptHandle & CryptoDecryptUseHandle = <Output = unknown, Input = unknown>(
			response: AxiosResponse<Output, Input>,
			options: FastAxiosRequestConfig<Input>
		): unknown => {
			return this._handle.decrypt<Output, Input>(response, options);
		};
		// 替换当前解密实现，同时保留对外的 decrypt 函数引用。
		decryptProxy.use = (fn: CryptoDecryptHandle): void => {
			this._handle.decrypt = fn;
		};
		this.decrypt = decryptProxy;
	}
}
