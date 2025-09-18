#!/usr/bin/env node
import fetch from "node-fetch";
import dotenv from "dotenv";
dotenv.config();

const { DISCORD_WEBHOOK_URL, ENTITY_IDS, REDISQ_URL } = process.env;
if (!DISCORD_WEBHOOK_URL || !ENTITY_IDS) {
	console.error("Missing DISCORD_WEBHOOK_URL or ENTITY_IDS in .env");
	process.exit(1);
}
const entityIds = ENTITY_IDS.split(",").map(id => id.trim()).map(Number).filter(Boolean);

async function pollRedisQ() {
	let text;
	try {
		const res = await fetch(REDISQ_URL);
		text = await res.text();
		const data = JSON.parse(text);

		if (data && data.package && data.package.killmail) {
			const killmail = data.package.killmail;
			const zkb = data.package.zkb;

			// Check attackers and victim
			const allEntities = [
				killmail.victim.faction_id,
				killmail.victim.alliance_id,
				killmail.victim.corporation_id,
				killmail.victim.character_id,
				...killmail.attackers.map(a => a.faction_id),
				...killmail.attackers.map(a => a.alliance_id),
				...killmail.attackers.map(a => a.corporation_id),
				...killmail.attackers.map(a => a.character_id)
			].map(Number).filter(Boolean);

			const match = allEntities.find(id => entityIds.includes(id));

			if (match) {
				await postToDiscord(killmail, zkb);
			}
		}
	} catch (err) {
		console.error("Error polling RedisQ:", err);
		console.error(text);
	} finally {
		setTimeout(pollRedisQ, 500);
	}
}

async function postToDiscord(killmail, zkb) {
	const url = `https://zkillboard.com/kill/${killmail.killmail_id}/`;

	const embed = {
		title: `Killmail #${killmail.killmail_id}`,
		description: `[View on zKillboard](${url})`,
		color: 16711680, // red
		fields: [
			{ name: "System", value: `${killmail.solar_system_id}`, inline: true },
			{ name: "ISK Value", value: `${zkb.totalValue.toLocaleString()} ISK`, inline: true }
		],
		timestamp: new Date(killmail.killmail_time).toISOString()
	};

	await fetch(DISCORD_WEBHOOK_URL, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		//body: JSON.stringify({ embeds: [embed] })
		body: JSON.stringify({ content: url })
	});

	console.log(`Posted killmail ${killmail.killmail_id} to Discord`);
}

pollRedisQ();


