import { HEADERS } from "./constants.js";
import NodeCache from "node-cache";
// MEMORY LEAK FIX: Add maxKeys to prevent unbounded cache growth
const json_cache = new NodeCache({ stdTTL: 30, maxKeys: 1000 });

export function unixtime() {
	return Math.floor(Date.now() / 1000);
}

// MEMORY LEAK FIX: Export cache clear function for memory pressure situations
export function clearJsonCache() {
	const keys = json_cache.keys().length;
	json_cache.flushAll();
	console.log(`🗑️ Cleared json_cache (${keys} entries)`);
}

export function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

export function getIDs(obj) {
	return Object.entries(obj)
		.filter(([key]) => key.endsWith('_id') && key !== 'group_id')
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
	let res = await fetchWithRetry(url, HEADERS);
	return await res.json();
}

export async function getJsonCached(url) {
	let value = json_cache.get(url);
	if (!value) {
		let res = await fetchWithRetry(url, HEADERS);
		value = await res.json();
		json_cache.set(url, value);
	}
	return value;
}

export async function fetchWithRetry(url, options = {}, maxAttempts = 15) {
	let attempts = 0;

	while (attempts < maxAttempts) {
		try {
			const response = await fetch(url, options);
			if (response.ok) {
				return response;
			} else {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}
		} catch (err) {
			attempts++;
			if (attempts >= maxAttempts) {
				console.error(`Failed to fetch after ${maxAttempts} attempts:`, url, err.message);
				throw err;
			}
			// Increasing pause: 500ms, 1s, 2s, 4s for attempts 1-4
			const pauseMs = 500 * Math.pow(2, attempts - 1);
			console.warn(`Fetch attempt ${attempts} failed, retrying in ${pauseMs}ms:`, err.message);
			await new Promise(resolve => setTimeout(resolve, pauseMs));
		}
	}
}