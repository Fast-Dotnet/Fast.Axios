import assert from "node:assert/strict";
import test from "node:test";
import { CacheManage } from "../../src/axios/types/cache";

test("custom storage receives unchanged keys and owns cleanup", () => {
	const cache = new CacheManage();
	const backend = new Map<string, unknown>();
	cache.get.use((key) => backend.get(key));
	cache.set.use((key, value) => {
		backend.set(key, value);
	});
	cache.set("key", "old");
	assert.equal(cache.get("key"), "old");
	cache.clear();
	assert.equal(cache.get("key"), "old");
	assert.equal(backend.get("key"), "old");
	cache.set("key", "new");
	assert.equal(cache.get("key"), "new");
});

test("separate containers reuse persisted entries with the same key", () => {
	const backend = new Map<string, unknown>();
	const create = () => {
		const cache = new CacheManage();
		cache.get.use((key) => backend.get(key));
		cache.set.use((key, value) => {
			backend.set(key, value);
		});
		return cache;
	};
	const first = create();
	first.set("key", "private");
	assert.equal(create().get("key"), "private");
	assert.deepEqual([...backend.keys()], ["key"]);
});

test("default cache bounds memory growth", () => {
	const cache = new CacheManage();
	for (let i = 0; i < 257; i++) cache.set(String(i), i);
	assert.equal(cache.get("0"), null);
	assert.equal(cache.get("256"), 256);
});

test("default storage preserves falsy values and expires at the five-minute boundary", (context) => {
	let now = 1000;
	context.mock.method(Date, "now", () => now);
	const cache = new CacheManage();
	for (const [key, value] of Object.entries({ zero: 0, false: false, empty: "" })) {
		cache.set(key, value);
		assert.equal(cache.get(key), value);
	}
	now += 299999;
	assert.equal(cache.get("zero"), 0);
	now++;
	assert.equal(cache.get("zero"), null);
	assert.equal(cache.get("missing"), null);
});

test("updating an existing entry refreshes its expiry and eviction position", (context) => {
	let now = 0;
	context.mock.method(Date, "now", () => now);
	const cache = new CacheManage();
	for (let index = 0; index < 256; index++) cache.set(String(index), index);
	now = 100000;
	cache.set("0", "renewed");
	cache.set("next", true);
	assert.equal(cache.get("1"), null);
	assert.equal(cache.get("0"), "renewed");
	now = 300000;
	assert.equal(cache.get("2"), null);
	assert.equal(cache.get("0"), "renewed");
});

test("clear invalidates default entries and stable proxies use the latest backend", () => {
	const cache = new CacheManage();
	const read = cache.get;
	const write = cache.set;
	const generation = cache.generation;
	cache.set("key", false);
	cache.clear();
	assert.equal(cache.generation, generation + 1);
	assert.equal(cache.get("key"), null);
	const backend = new Map<string, unknown>();
	cache.get.use((key) => backend.get(key));
	cache.set.use((key, value) => {
		backend.set(key, value);
	});
	write("key", 0);
	assert.equal(read("key"), 0);
});
