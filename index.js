#!/usr/bin/env node
import fetch from "node-fetch";
import dotenv from "dotenv";
import * as cheerio from "cheerio";

dotenv.config();

const { DISCORD_WEBHOOK_URL, ENTITY_IDS, REDISQ_URL } = process.env;
if (!DISCORD_WEBHOOK_URL || !ENTITY_IDS) {
	console.error("Missing DISCORD_WEBHOOK_URL or ENTITY_IDS in .env");
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

async function pollRedisQ() {
	let wait = 500; // RedisQ allows 20 queries / 10 seconds
	try {
		const res = await fetch(REDISQ_URL);
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
				const names = await getNames([...victimEntities, ...attackerEntities]);
				await postToDiscord(killmail, zkb, colorCode, names);
			}
		}
	} catch (err) {
		console.error("Error polling RedisQ:", err);
		wait = 5000;
	} finally {
		setTimeout(pollRedisQ, wait);
	}
}

async function postToDiscord(killmail, zkb, colorCode, names) {
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
		const victim = fillNames(names, killmail.victim);
		if (!victim.character_name) victim.character_name = victim.corporation_name;
		const victim_employer = victim.alliance_name ?? victim.corporation_name;

		const fb = fillNames(names, final_blow);
		if (!fb.character_name) fb.character_name = fb.corporation_name;
		if (!fb.character_name) fb.character_name = 'an NPC';
		const fb_employer = fb.alliance_name ?? (fb.corporation_name ?? (fb.faction_name ?? '???'));
		const solo = zkb.labels.indexOf('solo') > -1 ? ', solo, ' : '';
		const attacker_count = killmail.attackers.length - 1;
		const others = attacker_count > 0 ? ' along with ' + attacker_count + ' other pilot' + (attacker_count > 1 ? 's' : '') : '';

		const title = victim.ship_type_name;
		const image = `https://images.evetech.net/types/${killmail.victim.ship_type_id}/icon`;

		const description = `${victim.character_name} (${victim_employer}) lost their ${victim.ship_type_name} in [system]. Final Blow by ${fb.character_name} (${fb_employer})${solo} in their ${fb.ship_type_name}${others}. Total Value: ${zkb.totalValue.toLocaleString(LOCALE)} ISK`;

		const embed = {
			title: title,
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
			author: { name: victim.character_name, icon_url: `https://images.evetech.net/characters/${victim.character_id}/portrait?size=64`, url: url },
			footer: { text: fb.character_name, icon_url: `https://images.evetech.net/characters/${fb.character_id}/portrait?size=64` }
		};

		res = await fetch(DISCORD_WEBHOOK_URL, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				embeds: [embed],
				avatar_url: 'https://cdn.discordapp.com/icons/849992399639281694/4cf3d7dba477c789883b292f46bfc016.png',
				username: 'zKillBot'
			})
		});

		console.log(`Posted killmail ${killmail.killmail_id} to Discord`);
	} catch (e) {
		console.log(e);
	}
	if (process.env.TESTING === 'true') process.exit();
}

async function getNames(entities) {
	let headers = { method: 'post', body: JSON.stringify([...new Set(entities)]), ...HEADERS };
	let res = await fetch('https://esi.evetech.net/universe/names', headers);
	let json = await res.json();
	const names = Object.fromEntries(json.map(e => [e.id, e.name]));
	return names;
}

function fillNames(names, entity) {
	let ret = {};
	for (let [key, value] of Object.entries(entity)) {
		ret[key] = value;
		ret[key.replace('_id', '_name')] = (names[value] || '???');
	}
	return ret;
}

function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

pollRedisQ();


