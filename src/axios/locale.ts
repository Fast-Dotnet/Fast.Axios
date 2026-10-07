/**
 * 内建错误码的简体中文文案
 *
 * 配置容器根据这些键创建可覆盖的错误提示表；各语言使用相同的错误码键。
 */
export const defaultErrorMessages = {
	// Fast 请求流程通用提示
	default: "请求失败，请稍后再试！",
	cancelDuplicate: "重复请求，自动取消！",
	offLine: "您断网了！",
	fileDownloadError: "文件下载失败或此文件不存在！",
	// 常见 HTTP 响应状态码提示
	"302": "接口重定向了！",
	"400": "参数不正确！",
	"401": "您没有权限操作（令牌、用户名、密码错误）！",
	"403": "您的访问是被禁止的！",
	"404": "请求的资源不存在！",
	"405": "请求的格式不正确！",
	"408": "请求超时！",
	"409": "系统已存在相同数据！",
	"410": "请求的资源被永久删除，且不会再得到的！",
	"422": "当创建一个对象时，发生一个验证错误！",
	"429": "请求过于频繁，请稍后再试！",
	"500": "服务器内部错误！",
	"501": "服务未实现！",
	"502": "网关错误！",
	"503": "服务不可用，服务器暂时过载或维护！",
	"504": "服务暂时无法访问，请稍后再试！",
	"505": "HTTP版本不受支持！",
	// Axios adapter 和取消流程的标准错误码提示
	ETIMEDOUT: "请求超时！",
	ERR_CANCELED: "连接已被取消！",
	ECONNABORTED: "连接中断，服务器暂时过载或维护！",
	ERR_NETWORK: "网关错误，服务不可用，服务器暂时过载或维护！",
	// 部分 uni-app 平台只返回 `request:fail`，不提供更具体的网络错误码。
	"request:fail": "网关错误，服务不可用，服务器暂时过载或维护！",
};

// 以简体中文词条定义完整文案键，其他语言通过类型检查保证词条齐全。
const zhCN = {
	...defaultErrorMessages,
	loading: "加载中...",
	confirmTitle: "温馨提示",
	confirmButton: "确定",
	cancelButton: "取消",
	confirmCanceled: "用户取消了确认操作。",
	confirmUnavailable: "当前运行环境不支持 'window.confirm' API。",
	confirmFailed: "'uni.showModal' API 调用异常。",
	invalidResponse: "RESTful 响应必须是对象或空响应。",
	invalidDecryptedResponse: "解密后的 RESTful 响应必须是对象或空响应。",
	invalidCustomError: "自定义错误处理器返回了无效错误。",
	unserializableMessage: "无法序列化的错误信息",
};

/** SDK 内建语言 */
export type FastAxiosLocale = "zh-CN" | "zh-TW" | "en-US";

/**
 * SDK 内建文案键
 *
 * HTTP 状态码使用字符串键，Axios 错误码保持原值。
 */
export type FastAxiosMessageKey = keyof typeof zhCN;

/**
 * 应用语言或同步语言读取函数
 *
 * SDK 在读取文案时调用函数；不支持的语言或读取异常均回退到简体中文。
 */
export type FastAxiosLocaleSource = FastAxiosLocale | (() => string);

/**
 * 应用翻译回调
 *
 * 回调同步返回译文；返回 `null`、`undefined` 或抛出异常时，SDK 使用当前语言的内建文案。
 * 空字符串是有效译文。服务端消息和调用方显式指定的文案不会传入此回调。
 *
 * @param key - SDK 文案键
 * @param locale - 已解析的内建语言
 * @param fallback - 当前语言的内建文案
 * @returns 应用译文；返回 `null` 或 `undefined` 表示使用内建文案。
 */
export type FastAxiosTranslate = (key: FastAxiosMessageKey, locale: FastAxiosLocale, fallback: string) => string | null | undefined;

const messages = {
	"zh-CN": zhCN,
	"zh-TW": {
		"302": "介面重新導向了！",
		"400": "參數不正確！",
		"401": "您沒有權限操作（權杖、使用者名稱、密碼錯誤）！",
		"403": "您的存取被禁止！",
		"404": "請求的資源不存在！",
		"405": "請求的格式不正確！",
		"408": "請求逾時！",
		"409": "系統已存在相同資料！",
		"410": "請求的資源已永久刪除，且不會再提供！",
		"422": "建立物件時發生驗證錯誤！",
		"429": "請求過於頻繁，請稍後再試！",
		"500": "伺服器內部錯誤！",
		"501": "服務尚未實作！",
		"502": "閘道錯誤！",
		"503": "服務無法使用，伺服器暫時超載或維護中！",
		"504": "服務暫時無法存取，請稍後再試！",
		"505": "不支援此 HTTP 版本！",
		default: "請求失敗，請稍後再試！",
		cancelDuplicate: "重複請求，自動取消！",
		offLine: "您斷網了！",
		fileDownloadError: "檔案下載失敗或此檔案不存在！",
		ETIMEDOUT: "請求逾時！",
		ERR_CANCELED: "連線已被取消！",
		ECONNABORTED: "連線中斷，伺服器暫時超載或維護中！",
		ERR_NETWORK: "網路錯誤，服務無法使用，伺服器暫時超載或維護中！",
		"request:fail": "網路錯誤，服務無法使用，伺服器暫時超載或維護中！",
		loading: "載入中...",
		confirmTitle: "溫馨提示",
		confirmButton: "確定",
		cancelButton: "取消",
		confirmCanceled: "使用者取消了確認操作。",
		confirmUnavailable: "目前執行環境不支援 'window.confirm' API。",
		confirmFailed: "'uni.showModal' API 呼叫異常。",
		invalidResponse: "RESTful 回應必須是物件或空回應。",
		invalidDecryptedResponse: "解密後的 RESTful 回應必須是物件或空回應。",
		invalidCustomError: "自訂錯誤處理器傳回了無效錯誤。",
		unserializableMessage: "無法序列化的錯誤訊息",
	},
	"en-US": {
		"302": "The endpoint redirected!",
		"400": "Invalid parameters!",
		"401": "You are not authorized (invalid token, username, or password)!",
		"403": "Access is forbidden!",
		"404": "The requested resource does not exist!",
		"405": "Invalid request format!",
		"408": "Request timed out!",
		"409": "The same data already exists!",
		"410": "The requested resource has been permanently deleted!",
		"422": "A validation error occurred while creating an object!",
		"429": "Too many requests. Please try again later!",
		"500": "Internal server error!",
		"501": "Service not implemented!",
		"502": "Bad gateway!",
		"503": "Service unavailable. The server is overloaded or under maintenance!",
		"504": "The service is temporarily inaccessible. Please try again later!",
		"505": "HTTP version not supported!",
		default: "Request failed. Please try again later!",
		cancelDuplicate: "Duplicate request automatically canceled!",
		offLine: "You are offline!",
		fileDownloadError: "The file download failed or the file does not exist!",
		ETIMEDOUT: "Request timed out!",
		ERR_CANCELED: "The connection has been canceled!",
		ECONNABORTED: "Connection aborted. The server is overloaded or under maintenance!",
		ERR_NETWORK: "Network error. The service is unavailable, overloaded, or under maintenance!",
		"request:fail": "Network error. The service is unavailable, overloaded, or under maintenance!",
		loading: "Loading...",
		confirmTitle: "Notice",
		confirmButton: "OK",
		// `uni.showModal` 的小程序按钮文案最多 4 个字符，因此使用 Back 代替 Cancel。
		cancelButton: "Back",
		confirmCanceled: "The user canceled confirmation.",
		confirmUnavailable: "The current environment does not support the 'window.confirm' API.",
		confirmFailed: "The 'uni.showModal' API call failed.",
		invalidResponse: "The RESTful response must be an object or an empty response.",
		invalidDecryptedResponse: "The decrypted RESTful response must be an object or an empty response.",
		invalidCustomError: "The custom error handler returned an invalid error.",
		unserializableMessage: "The error message could not be serialized",
	},
} satisfies Record<FastAxiosLocale, Record<FastAxiosMessageKey, string>>;

/**
 * 将应用语言解析为 SDK 支持的内建语言。
 *
 * 传入函数时同步读取语言；不支持的语言或读取异常均回退到简体中文，不做语言别名转换。
 *
 * @param source - 应用语言或同步语言读取函数
 * @returns 支持的语言标识；无法解析时返回 `"zh-CN"`。
 */
export const resolveLocale = (source: FastAxiosLocaleSource): FastAxiosLocale => {
	try {
		const locale = typeof source === "function" ? source() : source;
		return locale === "zh-TW" || locale === "en-US" ? locale : "zh-CN";
	} catch {
		return "zh-CN";
	}
};

/**
 * 读取 SDK 内建文案，并通过可选的应用回调获取译文。
 *
 * 回调返回 `null`、`undefined` 或抛出异常时，使用当前语言的内建文案；空字符串是有效译文。
 * 调用方负责传入有效的文案键和已解析的内建语言。
 *
 * @param key - SDK 内建文案键
 * @param locale - 已解析的内建语言，默认使用简体中文
 * @param translate - 可选的同步翻译回调；省略或为 `null` 时直接使用内建文案。
 * @returns 应用译文或当前语言的内建文案
 */
export const translateMessage = (key: FastAxiosMessageKey, locale: FastAxiosLocale = "zh-CN", translate?: FastAxiosTranslate | null): string => {
	const fallback = messages[locale][key];
	try {
		return translate?.(key, locale, fallback) ?? fallback;
	} catch {
		// UI 翻译失败只影响文案，不得替换网络错误或改变取消语义。
		return fallback;
	}
};
