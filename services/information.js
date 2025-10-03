import { SEVEN_DAYS, HEADERS } from "../util/constants.js";
import { getJson, unixtime } from "../util/helpers.js";

import NodeCache from "node-cache";
const info_cache = new NodeCache({ stdTTL: 900 });
const names_cache = new NodeCache({ stdTTL: 900 });

const ESI_MAP = {
	'system': `https://esi.evetech.net/universe/systems/:id`,
	'constellation': `https://esi.evetech.net/universe/constellations/:id`,
	'region': `https://esi.evetech.net/universe/regions/:id`,
}

export async function entityUpdates(db) {
	try {
		const oneWeekAgo = unixtime() - SEVEN_DAYS;

		const staleEntities = await db.entities
			.find({ last_updated: { $lt: oneWeekAgo } })
			.limit(500)
			.toArray();

		if (staleEntities.length == 0) return;

		const entityIds = staleEntities.map(e => e.entity_id);
		const names = await getNames(db, entityIds, false);
		for (const n of names) {
			db.entities.updateOne({ id: n.entity_id }, { $set: { name: n.name, last_updated: unixtime() } });
		}
	} finally {
		setTimeout(entityUpdates.bind(null, db), 1000);
	}
}

export async function getNames(db, entityIds, use_cache = true) {
	// unique IDs
	const ids = [...new Set(entityIds)];

	// separate cached vs missing
	const missing = use_cache ? ids.filter(id => !(id in names_cache)) : ids;
	const needs_lookup = [];
	if (missing.length > 0) {
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
	console.log(needs_lookup.length, 'of', entityIds.length, "names need lookup");

	if (needs_lookup.length > 0) {
		const res = await fetch("https://esi.evetech.net/universe/names", {
			method: "POST",
			body: JSON.stringify(needs_lookup),
			...HEADERS
		});
		const json = await res.json();

		// add fetched names into cache
		for (const e of json) {
			names_cache.set(e.id, e.name);
			await db.entities.updateOne({
				entity_id: e.id
			}, {
				$set: { name: e.name, last_updated: unixtime() }
			},
				{ upsert: true }
			);
		}
	}

	// return an object with all the requested IDs → names
	return Object.fromEntries(ids.map(id => [id, names_cache.get(id)]));
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
		info.last_updated = unixtime();
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
