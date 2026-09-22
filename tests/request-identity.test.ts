import assert from "node:assert/strict";
import test from "node:test";
import { appendCacheBuster, serializeRequestBody } from "../src/axios/request-identity";
import { CacheManage } from "../src/axios/types/cache";

test("cache buster preserves repeated URLSearchParams without changing input", () => {
	const params = new URLSearchParams("tag=a&tag=b&page=2");
	const result = appendCacheBuster(params, 42);
	assert.ok(result instanceof URLSearchParams);
	assert.deepEqual(result.getAll("tag"), ["a", "b"]);
	assert.equal(result.get("_"), "42");
	assert.equal(params.toString(), "tag=a&tag=b&page=2");
});

test("request identity refuses opaque and cyclic bodies rather than collapsing them", () => {
	assert.equal(serializeRequestBody(new FormData()), undefined);
	assert.equal(serializeRequestBody(new Blob(["a"])), undefined);
	const cyclic: { self?: unknown } = {};
	cyclic.self = cyclic;
	assert.equal(serializeRequestBody(cyclic), undefined);
	assert.notEqual(serializeRequestBody({ name: "a" }), serializeRequestBody({ name: "b" }));
	assert.notEqual(serializeRequestBody(new URLSearchParams("tag=a&tag=b")), serializeRequestBody(new URLSearchParams("tag=b")));
});

test("cache namespace changes and clear invalidate older request generations", () => {
	const cache = new CacheManage();
	assert.equal(cache.namespace, "");
	cache.namespace = "account-A:tenant-1";
	cache.set("entry", 0);
	assert.equal(cache.get("entry"), 0);
	const generation = cache.generation;
	cache.namespace = "account-B:tenant-1";
	assert.ok(cache.generation > generation);
	assert.equal(cache.get("entry"), null);
	cache.set("entry", false);
	cache.clear();
	assert.equal(cache.get("entry"), null);
});

test("default response cache has a finite capacity", () => {
	const cache = new CacheManage();
	for (let index = 0; index < 257; index += 1) cache.set(String(index), index);
	assert.equal(cache.get("0"), null);
	assert.equal(cache.get("256"), 256);
});
