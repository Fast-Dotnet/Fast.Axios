import { createRequire } from "node:module";
import { resolve } from "node:path";
import { cwd, env } from "node:process";
import { createUnplugin } from "unplugin";
import type { TransformResult } from "unplugin";

// Axios 浏览器平台的 FormData 适配模块
const axiosFormDataModule = "axios/lib/platform/browser/classes/FormData.js";

// Axios 浏览器平台的 Blob 适配模块
const axiosBlobModule = "axios/lib/platform/browser/classes/Blob.js";

// form-data 包提供的浏览器入口模块
const formDataBrowserModule = "form-data/lib/browser.js";

// 小程序 FormData 兼容包名称
const miniprogramFormDataPackage = "miniprogram-formdata";

// 小程序 Blob 兼容包名称
const miniprogramBlobPackage = "miniprogram-blob";

/**
 * 需要进入转换流程的目标模块。
 *
 * 同时兼容：
 *
 * - Windows 路径分隔符 `\`
 * - POSIX 路径分隔符 `/`
 * - Vite、Rollup 等构建工具附加的查询参数
 * - npm、pnpm、yarn 等不同的 node_modules 目录结构
 */
const targetModuleFilters: RegExp[] = [
	/(?:^|[/\\])axios[/\\]lib[/\\]platform[/\\]browser[/\\]classes[/\\]FormData\.js(?:\?.*)?$/,
	/(?:^|[/\\])axios[/\\]lib[/\\]platform[/\\]browser[/\\]classes[/\\]Blob\.js(?:\?.*)?$/,
	/(?:^|[/\\])form-data[/\\]lib[/\\]browser\.js(?:\?.*)?$/,
];

// 支持的小程序兼容对象名称
type PolyfillFeature = "Blob" | "FormData";

// 从项目目录创建的 CommonJS require 实例
type ProjectRequire = ReturnType<typeof createRequire>;

/**
 * 判断当前是否为 uni-app 小程序构建。
 *
 * uni-app 的小程序平台通常以 `mp-` 开头，例如：
 *
 * - `mp-weixin`
 * - `mp-alipay`
 * - `mp-toutiao`
 * - `mp-baidu`
 *
 * @returns 当前构建目标为小程序时返回 `true`，否则返回 `false`。
 */
const isMiniProgramBuild = (): boolean => env["UNI_PLATFORM"]?.startsWith("mp-") === true;

/**
 * 标准化构建工具传入的模块 ID。
 *
 * 该方法会：
 *
 * 1. 移除 Vite、Rollup 等构建工具附加的查询参数。
 * 2. 将 Windows 路径分隔符统一转换为 `/`。
 *
 * @param id - 构建工具传入的原始模块 ID
 * @returns 标准化后的模块路径
 */
const normalizeModuleId = (id: string): string => {
	const queryIndex = id.indexOf("?");
	const cleanId = queryIndex === -1 ? id : id.slice(0, queryIndex);

	return cleanId.replace(/\\/g, "/");
};

/**
 * 判断标准化后的模块 ID 是否对应指定模块。
 *
 * 使用后缀匹配可以兼容以下目录结构：
 *
 * - `node_modules/axios/...`
 * - `node_modules/.pnpm/axios@x.x.x/node_modules/axios/...`
 * - workspace 链接目录
 * - 构建工具生成的绝对路径
 *
 * @param normalizedId - 已标准化的模块 ID
 * @param modulePath - 目标模块在包内的相对路径
 * @returns 模块匹配时返回 `true`。
 */
const matchesModule = (normalizedId: string, modulePath: string): boolean => normalizedId === modulePath || normalizedId.endsWith(`/${modulePath}`);

/**
 * 检查当前项目能否解析指定依赖包。
 *
 * 此检查从应用项目的当前工作目录开始，而不是从插件自身所在目录开始，
 * 从而要求使用者在应用项目中显式安装对应兼容包。
 *
 * @param requireFromProject - 从应用项目目录创建的 require 实例
 * @param feature - 当前需要兼容的功能名称
 * @param packageName - 对应的兼容包名称
 *
 * @throws 当应用项目无法解析对应兼容包时抛出构建错误。
 */
const assertPackageAvailable = (requireFromProject: ProjectRequire, feature: PolyfillFeature, packageName: string): void => {
	try {
		requireFromProject.resolve(packageName);
	} catch (error) {
		throw new Error(
			`小程序构建已加载 Axios 的 '${feature}' 适配模块，但无法从当前项目解析 '${packageName}'。` +
				`请执行 'pnpm add ${packageName}' 后重新构建。`,
			{ cause: error }
		);
	}
};

/**
 * 创建替换 Axios 平台适配模块的 ESM 代码。
 *
 * 例如 FormData 模块会被替换为：
 *
 * ```ts
 * import FormData from "miniprogram-formdata";
 *
 * export default FormData;
 * ```
 *
 * @param feature - 需要导出的兼容对象名称
 * @param packageName - 兼容对象所属的包名称
 * @returns 可直接返回给构建工具的模块转换结果
 */
const createPolyfillModule = (feature: PolyfillFeature, packageName: string): TransformResult => ({
	code: [`import ${feature} from ${JSON.stringify(packageName)};`, "", `export default ${feature};`, ""].join("\n"),
	map: null,
});

/**
 * 为 uni-app 小程序构建提供 Axios FormData 和 Blob 兼容处理。
 *
 * @remarks
 *
 * 插件仅在 `UNI_PLATFORM` 以 `mp-` 开头时生效，主要完成以下处理：
 *
 * 1. 将 Axios 浏览器平台的 FormData 模块替换为
 *    `miniprogram-formdata`。
 * 2. 将 Axios 浏览器平台的 Blob 模块替换为
 *    `miniprogram-blob`。
 * 3. 将 `form-data/lib/browser.js` 中的
 *    `window.FormData` 替换为 `globalThis.FormData`。
 * 4. 在转换对应 Axios 模块时，检查应用项目是否安装了兼容包。
 *
 * 这里检测的是“模块是否进入构建图”，不是“运行时是否真正执行了
 * FormData 或 Blob 相关代码”。由于 Axios 会静态导入两个平台模块，
 * 引入 Axios 后通常会同时触发两个模块的转换。
 *
 * @example Vite 中注册插件
 *
 * ```ts
 * import { defineConfig } from "vite";
 *
 * import { uniAppAxiosUnplugin } from "./src/unplugin";
 *
 * export default defineConfig({
 *     plugins: [uniAppAxiosUnplugin.vite()],
 * });
 * ```
 *
 * @example Webpack 中注册插件
 *
 * ```ts
 * import { uniAppAxiosUnplugin } from "./src/unplugin";
 *
 * export default {
 *     plugins: [uniAppAxiosUnplugin.webpack()],
 * };
 * ```
 *
 * @throws 当对应小程序兼容包无法从应用项目解析时终止构建。
 */
export const uniAppAxiosUnplugin = /* #__PURE__ */ createUnplugin(() => {
	let requireFromProject: ProjectRequire | undefined;

	/**
	 * 延迟创建基于应用项目目录的 require。
	 *
	 * 只有真正转换 Axios FormData 或 Blob 模块时才创建，
	 * 普通非小程序构建不会进行依赖解析。
	 *
	 * @returns 从当前应用项目目录创建的 require 实例
	 */
	const getRequireFromProject = (): ProjectRequire => {
		requireFromProject ??= createRequire(resolve(cwd(), "package.json"));

		return requireFromProject;
	};

	return {
		name: "fast-axios-uni-polyfills",

		// 必须在普通转换之前执行，避免 Axios 模块先被其他插件处理或合并。
		enforce: "pre",

		/**
		 * 仅处理 Axios FormData、Axios Blob 和 form-data 浏览器入口模块。
		 *
		 * transform.filter 是当前 unplugin 推荐的模块过滤方式，
		 * 用于替代已经废弃的 transformInclude。
		 */
		transform: {
			filter: {
				id: {
					include: targetModuleFilters,
				},
			},

			handler(code, id) {
				// H5、App、Node.js 等非小程序构建保持原始代码。
				if (!isMiniProgramBuild()) return;

				const normalizedId = normalizeModuleId(id);

				// form-data 在 self 不存在时访问 window.FormData；部分小程序没有 window，因此改用 globalThis。
				if (matchesModule(normalizedId, formDataBrowserModule)) {
					const transformedCode = code.replace(/\bwindow\.FormData\b/g, "globalThis.FormData");

					// 如果上游 form-data 修改了源码结构，没有匹配到目标代码，
					// 则不返回无意义的转换结果。
					if (transformedCode === code) return;

					return {
						code: transformedCode,
						map: null,
					};
				}

				// 替换 Axios 的 FormData 平台模块。
				// 只有该模块进入构建图后才检查 miniprogram-formdata，
				// 不会在插件文件被 import 时立即检查。
				if (matchesModule(normalizedId, axiosFormDataModule)) {
					assertPackageAvailable(getRequireFromProject(), "FormData", miniprogramFormDataPackage);

					return createPolyfillModule("FormData", miniprogramFormDataPackage);
				}

				// 替换 Axios 的 Blob 平台模块。
				// 只有该模块进入构建图后才检查 miniprogram-blob，
				// 不会在插件文件被 import 时立即检查。
				if (matchesModule(normalizedId, axiosBlobModule)) {
					assertPackageAvailable(getRequireFromProject(), "Blob", miniprogramBlobPackage);

					return createPolyfillModule("Blob", miniprogramBlobPackage);
				}

				// transform.filter 已经限制了模块范围。
				// 这里仍然返回 undefined，避免未知或上游变更后的模块被误处理。
				return;
			},
		},

		/**
		 * Vite 开发模式会预构建 node_modules 依赖。
		 *
		 * 将 Axios 排除出预构建后，其内部平台模块才能进入本插件的
		 * transform 钩子。该配置只影响 Vite 开发模式，不影响生产构建。
		 */
		vite: {
			config() {
				if (!isMiniProgramBuild()) return;

				return {
					optimizeDeps: {
						exclude: ["axios"],
					},
				};
			},
		},
	};
});
