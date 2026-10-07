import type { TestContext } from "node:test";

// 平台模拟在用例结束后恢复原描述符，避免污染后续环境判断。
export function replaceGlobal(context: TestContext, key: string, value: unknown): void {
	const descriptor = Object.getOwnPropertyDescriptor(globalThis, key);
	Object.defineProperty(globalThis, key, { configurable: true, value });
	context.after(() => {
		if (descriptor) Object.defineProperty(globalThis, key, descriptor);
		else Reflect.deleteProperty(globalThis, key);
	});
}
