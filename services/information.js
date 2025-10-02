import { SEVEN_DAYS, HEADERS } from "../util/constants.js";
import { unixtime } from "../util/helpers.js";
import { getJsonCached } from "../util/helpers.js";

export async function entityUpdates(db) {
	try {
		const oneWeekAgo = unixtime() - SEVEN_DAYS;

		const staleEntities = await db.entities
			.find({ last_updated: { $lt: oneWeekAgo } })
			.limit(500)
			.toArray();

		if (staleEntities.length == 0) return;

		const entityIds = staleEntities.map(e => e.entity_id);
		const names = await getNames(entityIds);
		for (const n of names) {
			db.entities.updateOne({ id: n.entity_id }, { $set: { name: n.name, last_updated: unixtime() } });
		}
	} finally {
		setTimeout(entityUpdates.bind(null, db), 1000);
	}
}
let names_cache = {};
let names_cache_clear = Date.now();
export async function getNames(entityIds, use_cache = true) {
	// Keep the cache from getting too large
	if (Date.now() - names_cache_clear > 3600000) {
		names_cache = {};
		names_cache_clear = Date.now();
	}

	// unique IDs
	const ids = [...new Set(entityIds)];

	// separate cached vs missing
	const missing = use_cache ? ids.filter(id => !(id in names_cache)) : ids;

	if (missing.length > 0) {
		const res = await fetch("https://esi.evetech.net/universe/names", {
			method: "POST",
			body: JSON.stringify(missing),
			...HEADERS
		});
		const json = await res.json();

		// add fetched names into cache
		for (const e of json) {
			names_cache[e.id] = e.name;
		}
	}

	// return an object with all the requested IDs → names
	return Object.fromEntries(ids.map(id => [id, names_cache[id]]));
}
export function fillNames(names, entity) {
	let ret = {};
	for (let [key, value] of Object.entries(entity)) {
		ret[key] = value;
		ret[key.replace('_id', '_name')] = (names[value] || '???');
	}
	return ret;
}

export async function getSystemNameAndRegion(solar_system_id) {
	let system = await getJsonCached(`https://esi.evetech.net/universe/systems/${solar_system_id}`);
	let constellation = await getJsonCached(`https://esi.evetech.net/universe/constellations/${system.constellation_id}`, HEADERS);
	let region = await getJsonCached(`https://esi.evetech.net/universe/regions/${constellation.region_id}`, HEADERS);

	return `${system.name} (${region.name})`;
}
export async function getSystemDetails(solar_system_id) {
	let system = await getJsonCached(`https://esi.evetech.net/universe/systems/${solar_system_id}`);
	let constellation = await getJsonCached(`https://esi.evetech.net/universe/constellations/${system.constellation_id}`);
	let region = await getJsonCached(`https://esi.evetech.net/universe/regions/${constellation.region_id}`);

	return { system, constellation, region };
}

