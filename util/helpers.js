import { HEADERS } from "./constants.js";

export function unixtime() {
	return Math.floor(Date.now() / 1000);
}
export function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}
export function getIDs(obj) {
	return Object.entries(obj)
		.filter(([key]) => key.endsWith('_id'))
		.map(([, value]) => value);
}
export function getFirstString(interaction, optionNames, defaultValue = "0") {
	for (const name of optionNames) {
		const value = interaction.options.getString(name);
		if (value) {
			return value.trim();
		}
	}
	return defaultValue;
}const json_cache = {};
export async function getJsonCached(url) {
	let value = json_cache[url];
	if (!value) {
		let res = await fetch(url, HEADERS);
		value = await res.json();
		json_cache[url] = value;
	}
	return value;
}

