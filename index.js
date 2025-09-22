#!/usr/bin/env node

import { readFileSync } from "fs";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config({ quiet: true });

const { DISCORD_WEBHOOK_URL, ENTITY_IDS, REDISQ_URL } = process.env;
if (!DISCORD_WEBHOOK_URL || !ENTITY_IDS || !REDISQ_URL) {
	console.error("Missing DISCORD_WEBHOOK_URL or ENTITY_IDS or REDISQ_URL in .env");
	process.exit(1);
}
const entityIds = ENTITY_IDS.split(",").map(id => id.trim()).map(Number).filter(Boolean);

const LOCALE = process.env.LOCALE ?? 'en';

const HEADERS = {
	headers: {
		"User-Agent": "zKillBot v0.0.1",
		"Accept": "application/json"
	}
}
let exiting = false;

async function pollRedisQ() {
	let wait = 500; // RedisQ allows 20 queries / 10 seconds
	try {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), 15000); // 15s timeout

		const res = await fetch(REDISQ_URL, { ...HEADERS, signal: controller.signal });
		const data = await res.json();

		if (data && data.package && data.package.killmail) {
			const killmail = data.package.killmail;
			const zkb = data.package.zkb;

			// Check attackers and victim
			const victimEntities = [
				killmail.victim.faction_id,
				killmail.victim.alliance_id,
				killmail.victim.corporation_id,
				killmail.victim.character_id,
				killmail.victim.ship_type_id
			].map(Number).filter(Boolean);

			const attackerEntities = [
				...killmail.attackers.map(a => a.faction_id),
				...killmail.attackers.map(a => a.alliance_id),
				...killmail.attackers.map(a => a.corporation_id),
				...killmail.attackers.map(a => a.character_id),
				...killmail.attackers.map(a => a.ship_type_id)
			].map(Number).filter(Boolean);

			let match = victimEntities.find(id => entityIds.includes(id));
			let colorCode;
			if (match) {
				colorCode = 15548997; // red
			} else {
				colorCode = 5763719; // green
				match = attackerEntities.find(id => entityIds.includes(id));
			}

			if (match || process.env.TESTING === 'true') {
				await postToDiscord(killmail, zkb, colorCode);
			}
		}
	} catch (err) {
		if (err.name === "AbortError") {
			console.error("Fetch timed out after 15 seconds");
		} else {
			console.error("Error polling RedisQ:", err);
		}
		wait = 5000;
	} finally {
		setTimeout(pollRedisQ, wait);
	}
}

async function postToDiscord(killmail, zkb, colorCode) {
	try {
		let res;
		const url = `https://zkillboard.com/kill/${killmail.killmail_id}/`;

		let final_blow = killmail.attackers[0]; // default to first
		for (let attacker of killmail.attackers) {
			if (attacker.final_blow) {
				final_blow = attacker;
				break;
			}
		}
		const [names, system] = await Promise.all([
			getNames([...getIDs(killmail.victim), ...getIDs(final_blow)]),
			getSystenNameAndRegion(killmail.solar_system_id)
		]);

		const victim = fillNames(names, killmail.victim);
		let victim_url = `https://zkillboard.com/character/${victim.character_id}/`;
		let victim_img = `https://images.evetech.net/characters/${victim.character_id}/portrait?size=64`;
		if (!victim.character_name) {
			victim.character_name = victim.corporation_name;
			victim_url = `https://zkillboard.com/corporation/${victim.corporation_id}/`;
			victim_img = `https://images.evetech.net/corporations//${victim.corporation_id}/logo?size=64`;
		}
		const victim_employer = victim.alliance_name ?? victim.corporation_name;

		const fb = fillNames(names, final_blow);
		let fb_img = `https://images.evetech.net/characters/${fb.character_id}/portrait?size=64`;
		if (!fb.character_name) {
			fb.character_name = fb.corporation_name;
			fb_img = `https://images.evetech.net/corporations//${fb.corporation_id}/logo?size=64`;
		}
		if (!fb.character_name) fb.character_name = 'an NPC';
		const fb_employer = fb.alliance_name ?? (fb.corporation_name ?? (fb.faction_name ?? '???'));
		const solo = zkb.labels.indexOf('solo') > -1 ? ', solo, ' : '';
		const attacker_count = killmail.attackers.length - 1;
		const others = attacker_count > 0 ? ' along with ' + attacker_count + ' other pilot' + (attacker_count > 1 ? 's' : '') : '';

		const image = `https://images.evetech.net/types/${killmail.victim.ship_type_id}/icon`;

		const description = `${victim.character_name} (${victim_employer}) lost their ${victim.ship_type_name} in ${system}. Final Blow by ${fb.character_name} (${fb_employer})${solo} in their ${fb.ship_type_name}${others}. Total Value: ${zkb.totalValue.toLocaleString(LOCALE)} ISK`;

		const embed = {
			title: victim.character_name + (victim.character_name.endsWith('s') ? "' " : "'s ") + victim.ship_type_name,
			description: description,
			color: colorCode,
			thumbnail: { url: image, height: 64, width: 64 },
			fields: [
				{ name: "Destroyed", value: `${zkb.destroyedValue.toLocaleString(LOCALE)} ISK`, inline: true },
				{ name: "Dropped", value: `${zkb.droppedValue.toLocaleString(LOCALE)} ISK`, inline: true },
				{ name: "Fitted", value: `${zkb.fittedValue.toLocaleString(LOCALE)} ISK`, inline: true },
				{ name: "Involved", value: `${killmail.attackers.length.toLocaleString(LOCALE)}`, inline: true },
				{ name: "Points", value: `${zkb.points.toLocaleString(LOCALE)}`, inline: true },
				{ name: "Killmail Value", value: `${zkb.totalValue.toLocaleString(LOCALE)} ISK`, inline: true },
			],
			timestamp: new Date(killmail.killmail_time),
			url: url,
			author: { name: victim.character_name, icon_url: victim_img, url: victim_url },
			footer: { text: fb.character_name, icon_url: fb_img }
		};

		if (!exiting) {
			res = await fetch(`${DISCORD_WEBHOOK_URL}?wait=true`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					embeds: [embed],
					avatar_url: 'https://cdn.discordapp.com/icons/849992399639281694/4cf3d7dba477c789883b292f46bfc016.png',
					username: 'zKillBot'
				})
			});

			console.log(`Posted killmail ${killmail.killmail_id} to Discord`);
			if (process.env.TESTING) {
				selfdestruct.push(await res.json());
			}
		}
	} catch (e) {
		console.log(e);
	}
}

let names_cache = {};
let names_cache_clear = Date.now();
async function getNames(entities) {
	// Keep the cache from getting too large
	if (Date.now() - names_cache_clear > 3600_000) {
		names_cache = {};
		names_cache_clear = Date.now();
	}

	// unique IDs
	const ids = [...new Set(entities)];

	// separate cached vs missing
	const missing = ids.filter(id => !(id in names_cache));

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
function fillNames(names, entity) {
	let ret = {};
	for (let [key, value] of Object.entries(entity)) {
		ret[key] = value;
		ret[key.replace('_id', '_name')] = (names[value] || '???');
	}
	return ret;
}

const systems = {};
const constellations = {};
const regions = {};
async function getSystenNameAndRegion(solar_system_id) {
	let system = await getJsonCached(`https://esi.evetech.net/universe/systems/${solar_system_id}`);
	let constellation = await getJsonCached(`https://esi.evetech.net/universe/constellations/${system.constellation_id}`, HEADERS);
	let region = await getJsonCached(`https://esi.evetech.net/universe/regions/${constellation.region_id}`, HEADERS);

	return `${system.name} (${region.name})`;
}

const json_cache = {};
async function getJsonCached(url) {
	let value = json_cache[url];
	if (!value) {
		let res = await fetch(url, HEADERS);
		value = await res.json();
		json_cache[url] = value;
	}
	return value;
}

function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

function getIDs(obj) {
	return Object.entries(obj)
		.filter(([key]) => key.endsWith('_id'))
		.map(([, value]) => value);
}

let webhoook_announcement = null;
let selfdestruct = [];
async function startUp() {
	const pkg = JSON.parse(readFileSync("./package.json", "utf8"));
	const { name, version } = pkg;
	let zKillBotVersion = `${name} v${version}`;
	let locale = `  Locale set to: '${LOCALE}'.`;

	console.log(zKillBotVersion);
	console.log(locale);

	let mode;
	if (process.env.TESTING == 'true') {
		mode = 'TESTING mode detected! Listening for any killmail...';
	} else {
		mode = '  Watching for killmails from: ' + Object.values(await getNames(entityIds)).sort().join(', ') + '\n';
	}
	console.log(mode);
	console.log(); // empty line on purpose

	let res = await fetch(`${DISCORD_WEBHOOK_URL}?wait=true`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			avatar_url: 'https://cdn.discordapp.com/icons/849992399639281694/4cf3d7dba477c789883b292f46bfc016.png',
			username: 'zKillBot',
			content: `${name} v${version} activated... ${locale} ${mode} (this message will delete within 1 minute)`
		})
	});
	webhoook_announcement = await res.json();
	selfdestruct.push(webhoook_announcement);

	await sleep(60000);
	const deleteUrl = `${DISCORD_WEBHOOK_URL}/messages/${webhoook_announcement.id}`;
	res = await fetch(deleteUrl, { method: "DELETE" });
	webhoook_announcement = null;
}


process.on("SIGINT", async () => {
	exiting = true;
	if (selfdestruct.length > 0) await executeSelfDestruct();

	console.log();
	console.log('Shutting down... RedisQ will remember your queueID for up to 3 hours...');
	process.exit(0);
});

async function executeSelfDestruct() {
	console.log('Executing self destruct....');

	while (selfdestruct.length) {
		const del = selfdestruct.pop();
		const deleteUrl = `${DISCORD_WEBHOOK_URL}/messages/${del.id}`;
		try {
			await fetch(deleteUrl, { method: "DELETE" });
			await sleep(100);
		} catch (e) {
			// ignore self destruct errors
		}
	}
}

startUp();
pollRedisQ();


