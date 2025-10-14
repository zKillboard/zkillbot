import { DAYS_7, HEADERS } from "../util/constants.js";
import { getJson, unixtime } from "../util/helpers.js";

import NodeCache from "node-cache";
const info_cache = new NodeCache({ stdTTL: 900 });
const names_cache = new NodeCache({ stdTTL: 900 });

const ESI_MAP = {
	'system': `https://esi.evetech.net/universe/systems/:id`,
	'constellation': `https://esi.evetech.net/universe/constellations/:id`,
	'region': `https://esi.evetech.net/universe/regions/:id`,
	'type': `https://esi.evetech.net/universe/types/:id`,
	'group': `https://esi.evetech.net/universe/groups/:id`,
	'category': `https://esi.evetech.net/universe/categories/:id`,
}

/**
 * Retrieves the names for a list of entity IDs, using a cache and database lookup as needed.
 *
 * @param {Object} db - The database connection object, expected to have an `entities` collection.
 * @param {Array<string|number>} entityIds - Array of entity IDs to retrieve names for.
 * @param {boolean} [use_cache=true] - Whether to use the names cache for lookups.
 * @returns {Promise<Object>} - A promise that resolves to an object mapping entity IDs to their names.
 */
export async function getNames(db, entityIds, use_cache = true) {
	// unique IDs
	const ids = Array.from(new Set(entityIds));

	// separate cached vs missing
	const missing = use_cache ? ids.filter(id => !(id in names_cache)) : ids;
	const needs_lookup = use_cache ? [] : missing;

	if (use_cache && missing.length > 0) {
		const from_db = await db.entities.find({ entity_id: { $in: missing } }).toArray();
		for (const e of from_db) {
			names_cache.set(e.entity_id, e.name);
		}
		for (const id of missing) {
			if (!names_cache.get(id)) {
				needs_lookup.push(id);
			}
		}
	}

	if (needs_lookup.length > 0) {
		const json = await doNamesLookup(needs_lookup);

		try {
			// add fetched names into cache
			for (const e of json) {
				if (e.category === 'unknown') continue;

				if (use_cache) names_cache.set(e.id, e.name);
				await db.entities.updateOne({
					entity_id: e.id
				}, {
					$set: {
						name: e.name,
						createdAt: new Date()
					}
				},
					{ upsert: true }
				);
			}
		} catch (e) {
			console.error("Error updating names in database:", e, json);
		}
	}

	// return an object with all the requested IDs → names
	return Object.fromEntries(ids.map(id => [id, names_cache.get(id)]));
}

async function doNamesLookup(ids) {
	if (ids.length == 0) return [];

	try {
		const res = await fetch("https://esi.evetech.net/universe/names", {
			method: "POST",
			body: JSON.stringify(ids),
			...HEADERS
		});
		return await res.json();
	} catch (e) {
		if (ids.length == 1) {
			// Problem with this single ID
			return [{
				category: 'unknown',
				id: ids[0],
				name: `${ids[0]} Lookup Failed`
			}];
		}
		// Binary split until we're down to the one id that is causing issues....
		const mid = Math.ceil(ids.length / 2);
		const firstHalf = ids.slice(0, mid);
		const secondHalf = ids.slice(mid);
		return [...await doNamesLookup(firstHalf), ...await doNamesLookup(secondHalf)];
	}
}

export function fillNames(names, entity) {
	let ret = {};
	for (let [key, value] of Object.entries(entity)) {
		ret[key] = value;
		ret[key.replace('_id', '_name')] = (names[value] || '???');
	}
	return ret;
}

export async function getSystemNameAndRegion(db, solar_system_id) {
	const { system, region } = await getSystemDetails(db, solar_system_id);
	return `${system.name} (${region.name})`;
}

export async function getSystemDetails(db, solar_system_id) {
	const system = await getInformation(db, 'system', solar_system_id);
	const constellation = await getInformation(db, 'constellation', system.constellation_id);
	const region = await getInformation(db, 'region', constellation.region_id);
	return { system, constellation, region };
}

export async function getShipGroup(db, type_id) {
	const type = await getInformation(db, 'type', type_id);
	if (!type) return null;
	if (!type.group_id) return null;
	const group = await getInformation(db, 'group', type.group_id);
	return group;
}

export async function getShipCategory(db, type_id) {
	const type = await getInformation(db, 'type', type_id);
	if (!type) return null;
	if (!type.group_id) return null;
	const group = await getInformation(db, 'group', type.group_id);
	if (!group) return null;
	if (!group.category_id) return null;
	const category = await getInformation(db, 'category', group.category_id);
	return category;
}

export async function getInformation(db, type, id) {
	const cacheKey = `${type}:${id}`;
	let info = info_cache.get(cacheKey);
	if (info) return info;

	info = await db.information.findOne({ type: type, id: id });
	if (info) {
		info_cache.set(cacheKey, info);
		return info;
	}

	// fetch from ESI
	if (!(type in ESI_MAP)) {
		throw new Error(`Unknown information type: ${type}`);
	}
	const url = ESI_MAP[type].replace(':id', id);
	try {
		info = await getJson(url);
	} catch (e) {
		console.error(`${url}\nFailed to fetch ${type} ${id} from ESI:`, e);
		return null;
	}
	if (info) {
		info.type = type;
		info.id = id;
		await db.information.updateOne(
			{ type: type, id: id },
			{ $set: info },
			{ upsert: true }
		);
		info_cache.set(cacheKey, info);
		return info;
	}
	return null;
}
