import { HEADERS } from "./constants.js";
import NodeCache from "node-cache";
const json_cache = new NodeCache({ stdTTL: 30 });

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
}

export async function getJson(url) {
	let res = await fetch(url, HEADERS);
	return await res.json();
}

export async function getJsonCached(url) {
	let value = json_cache.get(url);
	if (!value) {
		let res = await fetch(url, HEADERS);
		value = await res.json();
		json_cache.set(url, value);
	}
	return value;
}

