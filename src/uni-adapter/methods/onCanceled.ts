import { CanceledError } from "axios";
import type { Cancel, InternalAxiosRequestConfig } from "axios";
import type { UniNetworkTask } from "../type";

/**
 * 把 Axios 的取消来源连接到当前 uni-app 网络任务的 `abort()`。
 *
 * 一个实例只服务一个请求：订阅 AbortSignal 和旧版 CancelToken，把取消统一转换为 Axios CanceledError，
 * 并在 uni complete 回调中移除监听，避免已完成请求继续响应后续取消事件。
 */
export default class OnCanceled {
	/** 保存取消来源及创建 CanceledError 所需的原始请求上下文。 */
	private readonly config: InternalAxiosRequestConfig;

	/** AbortSignal 与 CancelToken 共用的回调；必须保存同一引用才能正确取消订阅。 */
	private onCanceled?: (cancel?: Cancel | Event) => void;

	/** @param config - 当前请求的内部配置，不会被取消处理器修改。 */
	constructor(config: InternalAxiosRequestConfig) {
		this.config = config;
	}

	/**
	 * 订阅配置中存在的全部取消来源，并将它们绑定到指定任务。
	 *
	 * @param task - 当前请求实际创建的 RequestTask、UploadTask 或 DownloadTask
	 * @param reject - 当前 adapter Promise 的拒绝函数，用于先报告 Axios 取消错误。
	 */
	subscribe(task: Pick<UniNetworkTask, "abort">, reject: (reason?: unknown) => void): void {
		// 无取消来源时立即返回，避免闭包无意义地持有 task、config 和 reject。
		if (!this.config.cancelToken && !this.config.signal) return;

		this.onCanceled = (cancel): void => {
			// AbortSignal 传入 Event（含 type）；CancelToken 传入 Axios 已创建的 Cancel 原因，需原样向外抛出。
			reject(!cancel || "type" in cancel ? new CanceledError(undefined, this.config, task) : cancel);
			// 必须先 reject 再 abort；部分平台 abort 会同步触发 fail，否则调用方可能先收到 ERR_NETWORK。
			task.abort();
		};
		const onCanceled = this.onCanceled;

		// CancelToken 可能与 signal 同时存在，两者任一触发都应取消同一个任务。
		this.config.cancelToken?.subscribe(onCanceled);

		// 请求创建前就已 aborted 的 signal 不会再派发事件，因此必须立即执行取消回调。
		if (this.config.signal?.aborted) onCanceled();
		else this.config.signal?.addEventListener?.("abort", onCanceled);
	}

	/**
	 * 移除两个取消来源上的监听器并释放闭包引用。
	 *
	 * 方法可重复调用；未订阅或已经清理时直接返回。
	 */
	unsubscribe(): void {
		const onCanceled = this.onCanceled;
		if (!onCanceled) return;

		// 两种取消来源相互独立，必须分别使用订阅时保存的同一回调引用清理。
		this.config.cancelToken?.unsubscribe(onCanceled);
		this.config.signal?.removeEventListener?.("abort", onCanceled);
		this.onCanceled = undefined;
	}
}
