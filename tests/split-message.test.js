import assert from "node:assert/strict";
import { splitMessage } from "../src/util/discord-message.js";

assert.deepEqual(splitMessage("short message"), ["short message"]);

const lines = `${"a".repeat(1500)}\n${"b".repeat(700)}`;
assert.deepEqual(splitMessage(lines), ["a".repeat(1500), "b".repeat(700)]);

const longLine = "x".repeat(4500);
const hardSplit = splitMessage(longLine);
assert.deepEqual(hardSplit.map(chunk => chunk.length), [2000, 2000, 500]);

const exactLength = "y".repeat(2000);
assert.deepEqual(splitMessage(exactLength), [exactLength]);

for (const chunk of [...splitMessage(lines), ...hardSplit]) {
	assert.ok(chunk.length <= 2000);
}

console.log("splitMessage tests passed");
