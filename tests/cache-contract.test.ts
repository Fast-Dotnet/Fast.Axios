import assert from "node:assert/strict";
import test from "node:test";
import { CacheManage } from "../src/axios/types/cache";

test("clear and namespace changes invalidate keys including custom storage", () => {
	const cache = new CacheManage();
	const backend = new Map<string, unknown>();
	cache.get.use((key) => backend.get(key));
	cache.set.use((key, value) => {
		backend.set(key, value);
	});
	cache.namespace = "first";
	cache.set("key", "old");
	assert.equal(cache.get("key"), "old");
	cache.clear();
	assert.equal(cache.get("key"), undefined);
	cache.set("key", "new");
	cache.namespace = "second";
	assert.equal(cache.get("key"), undefined);
	cache.namespace = "first";
	assert.equal(cache.get("key"), undefined);
});

test("separate containers cannot revive persisted entries after restart", () => {
	const backend = new Map<string, unknown>();
	const create = () => {
		const cache = new CacheManage();
		cache.get.use((key) => backend.get(key));
		cache.set.use((key, value) => {
			backend.set(key, value);
		});
		cache.namespace = "same-account";
		return cache;
	};
	const first = create();
	first.set("key", "private");
	assert.equal(create().get("key"), undefined);
});

test("default cache bounds memory growth", () => {
	const cache = new CacheManage();
	for (let i = 0; i < 257; i++) cache.set(String(i), i);
	assert.equal(cache.get("0"), null);
	assert.equal(cache.get("256"), 256);
});
