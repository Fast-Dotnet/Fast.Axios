import type { AxiosResponse } from "axios";

/**
 * 从 Content-Disposition 或请求 URL 中提取下载文件名。
 *
 * @param response - 已通过 Axios 状态校验的文件响应
 * @returns RFC 5987 文件名、普通 filename、URL 末段或最终兜底名称 download
 */
const getDownloadFileName = (response: AxiosResponse): string => {
	const headerValue: unknown = Object.entries(response.headers).find(([name]) => name.toLowerCase() === "content-disposition")?.[1];
	const disposition = typeof headerValue === "string" ? headerValue : "";
	// 优先读取支持 UTF-8 的 filename*，再兼容普通 filename="..." 格式。
	const encodedName = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1];
	const basicName = /filename="?([^";]+)"?/i.exec(disposition)?.[1];
	const urlName = response.config.url?.split("?")[0]?.split("/").pop();
	const rawName = encodedName ?? basicName ?? urlName ?? "download";

	try {
		// 服务端常把中文、空格等字符进行 URL 编码，下载前恢复原始文件名。
		return decodeURIComponent(rawName);
	} catch {
		return rawName;
	}
};

const documentMimeTypes = {
	"application/msword": "doc",
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
	"application/vnd.ms-excel": "xls",
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
	"application/vnd.ms-powerpoint": "ppt",
	"application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
	"application/pdf": "pdf",
} as const;

let fileSequence = 0;

// 每次写入使用独立文件，避免并发导出覆盖正在预览的文档。
const writeAppFile = async (data: ArrayBuffer, name: string): Promise<string> => {
	const fileSystem = await new Promise<PlusIoFileSystem>((resolve, reject) => {
		plus.io.requestFileSystem(plus.io.PRIVATE_DOC, resolve, reject);
	});
	const root = fileSystem.root;
	if (!root) throw new Error("App 文件系统未返回根目录。");
	const entry = await new Promise<PlusIoFileEntry>((resolve, reject) => {
		root.getFile(name, { create: true, exclusive: true }, resolve, reject);
	});
	const writer = await new Promise<PlusIoFileWriter>((resolve, reject) => {
		entry.createWriter(resolve, reject);
	});
	try {
		await new Promise<void>((resolve, reject) => {
			writer.onwrite = () => resolve();
			writer.onerror = () => reject(new Error(`文件写入失败：${writer.error ?? "unknown"}`));
			writer.onabort = () => reject(new Error("文件写入已中止。"));
			// HTML5+ 的二进制写入接收纯 Base64，不能用 write() 写入文本或 Data URL。
			writer.writeAsBinary(uni.arrayBufferToBase64(data));
		});
	} finally {
		writer.onwrite = undefined;
		writer.onerror = undefined;
		writer.onabort = undefined;
	}
	return entry.toLocalURL();
};

const openUniDocument = async (response: AxiosResponse<unknown>, fileName: string, platform: string): Promise<void> => {
	const extension = fileName.split(".").pop()?.toLowerCase();
	const contentType: unknown = Object.entries(response.headers).find(([name]) => name.toLowerCase() === "content-type")?.[1];
	const mimeType = typeof contentType === "string" ? contentType.split(";")[0]?.trim().toLowerCase() : undefined;
	const mimeExtension = Object.entries(documentMimeTypes).find(([mime]) => mime === mimeType)?.[1];
	// 有明确后缀时以文件名为准，避免将 zip 等文件仅凭错误的 MIME 当作文档打开。
	const fileType = fileName.includes(".") ? extension : mimeExtension;
	if (!Object.values(documentMimeTypes).some((type) => type === fileType)) return;
	if (platform !== "app" && !platform.startsWith("mp-")) return;

	let filePath: string;
	if (typeof response.data === "string") {
		// method: download 已由 uni.downloadFile 写入临时文件，直接复用路径。
		filePath = response.data;
	} else {
		if (!(response.data instanceof ArrayBuffer)) throw new TypeError("uni-app 文件响应必须为 ArrayBuffer 或本地文件路径。");
		// 去掉服务端文件名中的路径和非法字符，写入目标始终限制在应用文件目录内。
		const safeName = Array.from(fileName, (character) => (character.charCodeAt(0) < 32 || /[<>:"/\\|?*]/.test(character) ? "_" : character)).join(
			""
		);
		const name = `fast-${Date.now()}-${fileSequence++}-${safeName}${fileName.includes(".") ? "" : `.${fileType}`}`;
		if (platform === "app") {
			filePath = await writeAppFile(response.data, name);
		} else {
			const env: unknown = Reflect.get(uni, "env");
			const directory: unknown = env && typeof env === "object" ? Reflect.get(env, "USER_DATA_PATH") : undefined;
			if (typeof directory !== "string" || !directory) throw new Error("当前小程序未提供 USER_DATA_PATH 文件目录。");
			filePath = `${directory}/${name}`;
			const data = response.data;
			await new Promise<void>((resolve, reject) => {
				uni.getFileSystemManager().writeFile({ filePath, data, success: () => resolve(), fail: reject });
			});
		}
	}
	await new Promise<void>((resolve, reject) => {
		uni.openDocument({ filePath, fileType, showMenu: true, success: () => resolve(), fail: reject });
	});
};

/**
 * 保存浏览器文件响应，或在 uni-app 中落盘并打开支持的文档。
 *
 * App / 小程序对不支持或无法识别的格式不执行落盘和打开，已有本地路径直接复用。
 *
 * @param response - data 为 Blob、ArrayBuffer 或 uni 下载临时路径的 Axios 文件响应
 * @returns 浏览器同步完成；App / 小程序返回等待文件写入和打开的 Promise
 * @throws 浏览器 API 缺失时同步抛错；uni 文件写入或打开失败时 Promise 拒绝。
 */
export const downloadFile = (response: AxiosResponse<unknown>): void | Promise<void> => {
	if (typeof uni !== "undefined") {
		const info = typeof uni.getAppBaseInfo === "function" ? uni.getAppBaseInfo() : undefined;
		const platform: unknown = info ? Reflect.get(info, "uniPlatform") : undefined;
		const uniPlatform = typeof platform === "string" ? platform : uni.getSystemInfoSync().uniPlatform;
		if (uniPlatform !== "web") return openUniDocument(response, getDownloadFileName(response), uniPlatform);
	}
	if (typeof window === "undefined" || typeof document === "undefined" || typeof Blob === "undefined") {
		throw new Error("当前运行环境不支持浏览器文件下载 API。");
	}

	// Axios 已返回 Blob 时直接复用；其他二进制或文本数据统一包装成下载 Blob。
	const data = response.data;
	const blobData = ArrayBuffer.isView(data)
		? new Uint8Array(data.buffer, data.byteOffset, data.byteLength).slice().buffer
		: data instanceof ArrayBuffer || typeof data === "string"
			? data
			: String(data);
	const blob = data instanceof Blob ? data : new Blob([blobData], { type: "application/octet-stream;charset=UTF-8" });
	const downloadElement = document.createElement("a");
	// uni.downloadFile 的 H5 结果已经是可访问的资源地址，不能把路径字符串写进 Blob。
	const isTemporaryUrl = typeof response.data === "string" && response.config.method?.toLowerCase() === "download";
	const href = isTemporaryUrl && typeof response.data === "string" ? response.data : window.URL.createObjectURL(blob);
	// 临时 a 标签不参与页面布局，只借助浏览器原生 download 能力触发保存。
	downloadElement.style.display = "none";
	downloadElement.href = href;
	downloadElement.download = getDownloadFileName(response);
	try {
		document.body.appendChild(downloadElement);
		downloadElement.click();
	} finally {
		// 挂载或点击失败也必须释放本次创建的对象；不移除其他节点。
		try {
			downloadElement.remove();
		} finally {
			if (!isTemporaryUrl) window.URL.revokeObjectURL(href);
		}
	}
};
