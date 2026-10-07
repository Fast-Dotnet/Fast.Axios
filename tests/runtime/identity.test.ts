import assert from "node:assert/strict";
import test from "node:test";
import { appendCacheBuster, serializeRequestBody } from "../../src/axios/request-identity";

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

test("serializable values retain distinctions without invoking custom protocols", () => {
	for (const value of [null, false, 0, "", [1, null], { nested: { value: true } }]) {
		assert.equal(serializeRequestBody(value), JSON.stringify(value));
	}
	assert.equal(serializeRequestBody(undefined), "undefined");
	for (const value of [NaN, Infinity, 1n, Symbol("value"), new Date(), { absent: undefined }, { toJSON: () => "hidden" }]) {
		assert.equal(serializeRequestBody(value), undefined);
	}
	const shared = { value: 1 };
	assert.equal(serializeRequestBody([shared, shared]), '[{"value":1},{"value":1}]');
});

test("cache busters copy plain parameters and preserve custom serializer inputs", () => {
	const params = { page: 0, _: 1 };
	assert.deepEqual(appendCacheBuster(params, 42), { page: 0, _: 42 });
	assert.deepEqual(params, { page: 0, _: 1 });
	assert.deepEqual(appendCacheBuster(null, 42), { _: 42 });
	const custom = new Date(0);
	assert.equal(appendCacheBuster(custom, 42), custom);
});
