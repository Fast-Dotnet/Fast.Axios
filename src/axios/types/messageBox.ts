import { translateMessage } from "../locale";
import type { FastAxiosMessageKey } from "../locale";

/** 确认框调用参数，由错误提示和业务确认流程共同使用。 */
interface MessageBoxOptions {
	/** 确认框正文 */
	message: string;
	/** 交给自定义确认框处理器的视觉类型；原生 confirm/showModal 不使用该字段。 */
	type?: "success" | "warning" | "info" | "error";
	/**
	 * 取消按钮文字
	 *
	 * 未指定时使用当前语言的内建文案。小程序最多允许 4 个字符，浏览器原生 `confirm` 无法自定义。
	 */
	cancelButtonText?: string;
	/**
	 * 确认按钮文字
	 *
	 * 未指定时使用当前语言的内建文案。小程序最多允许 4 个字符，浏览器原生 `confirm` 无法自定义。
	 */
	confirmButtonText?: string;
}
/** 打开确认框并等待用户选择；确认时完成，取消或失败时拒绝。 */
type MessageBoxHandle = (options: MessageBoxOptions) => Promise<void>;
/** 为确认框函数附加实现替换入口。 */
interface MessageBoxUseHandle {
	/** 使用新的确认框函数替换当前实现。 */
	use: (fn: MessageBoxHandle) => void;
}

/**
 * 跨浏览器和 uni-app 的确认框处理器
 *
 * 用户确认时 Promise resolve，用户取消或平台 API 调用失败时 Promise reject。
 */
export class MessageBoxManage {
	/** 当前实际执行的确认框函数 */
	private readonly _handle: {
		confirm: MessageBoxHandle;
	};

	/** 打开确认框；`.use(fn)` 可替换为 Fast 项目自己的 UI 组件。 */
	readonly confirm: MessageBoxHandle & MessageBoxUseHandle;

	/**
	 * 创建优先使用 uni-app、其次使用浏览器原生 `confirm` 的确认框处理器。
	 *
	 * @param translate - 同步文案读取函数；默认使用简体中文内建文案。
	 */
	constructor(translate: (key: FastAxiosMessageKey) => string = translateMessage) {
		this._handle = {
			confirm: async (options): Promise<void> => {
				// uni 是 uni-app 注入的全局对象；存在时使用跨端 showModal，不能访问浏览器 DOM。
				if (typeof uni !== "undefined") {
					return new Promise((resolve, reject) => {
						uni.showModal({
							// 标题和默认按钮文案在弹窗打开时读取，以跟随应用语言切换。
							title: translate("confirmTitle"),
							content: options.message,
							cancelText: options.cancelButtonText ?? translate("cancelButton"),
							confirmText: options.confirmButtonText ?? translate("confirmButton"),
							success: (res) => {
								// showModal 成功只表示弹窗正常结束，仍要根据 confirm 判断用户选择。
								if (res.confirm) {
									resolve();
								} else {
									reject(new Error(translate("confirmCanceled")));
								}
							},
							fail: (res: UniNamespace.GeneralCallbackResult) => {
								// 异步回调中必须 reject 当前 Promise，直接 throw 无法让调用方捕获失败结果。
								reject(new Error(`${translate("confirmFailed")}${res.errMsg}`));
							},
						});
					});
				}

				// SSR、Node.js 等环境既没有 uni，也没有 window.confirm，需要返回可捕获的失败 Promise。
				if (typeof window === "undefined" || typeof window.confirm !== "function") {
					return Promise.reject(new Error(translate("confirmUnavailable")));
				}

				// 原生 confirm 只返回 boolean，转换为 Promise 后与 uni-app 和自定义实现保持相同调用方式。
				// eslint-disable-next-line no-alert -- 默认浏览器确认框使用原生交互
				return window.confirm(options.message) ? Promise.resolve() : Promise.reject(new Error(translate("confirmCanceled")));
			},
		};

		// 代理函数保持对外引用稳定，每次调用都转发给最新注册的确认框实现。
		const confirmProxy: MessageBoxHandle & MessageBoxUseHandle = async (options): Promise<void> => {
			return this._handle.confirm(options);
		};
		// 替换后续确认框实现，例如接入 Element Plus；不会立即打开确认框。
		confirmProxy.use = (fn: MessageBoxHandle): void => {
			this._handle.confirm = fn;
		};
		this.confirm = confirmProxy;
	}
}
