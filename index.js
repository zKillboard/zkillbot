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

const HEADERS = {
	headers: {
		"User-Agent": "simplediscordbot",
		"Accept": "application/json"
	}
}

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
	try {
		let res;

		const url = `https://zkillboard.com/kill/${killmail.killmail_id}/`;

		let success = false, html;
		do {
			try {
				res = await fetch(url, HEADERS);
				html = await res.text();
				success = res.status == 200;
			} catch (e) {
				success = false;
				console.error(e);
			}
			if (success == false) await sleep(1000);
		} while (success == false);

		const $ = cheerio.load(html);
		const description = $('meta[name="og:description"]').attr("content");
		const image = $('meta[name="og:image"]').attr("content");

		const embed = {
			title: url,
			description: description,
			color: 16711680, // red
			thumbnail: { url: image, height: 64, width: 64 },
			fields: [
				//{ name: "System", value: `${killmail.solar_system_id}`, inline: true },
				{ name: "Destroyed", value: `${zkb.destroyedValue.toLocaleString()} ISK`, inline: true },
				{ name: "Dropped", value: `${zkb.droppedValue.toLocaleString()} ISK`, inline: true },
				{ name: "Fitted", value: `${zkb.fittedValue.toLocaleString()} ISK`, inline: true },
				{ name: "Total", value: `${zkb.totalValue.toLocaleString()} ISK`, inline: true },
				{ name: "Involved", value: `${killmail.attackers.length.toLocaleString()}`, inline: true },
				{ name: "Points", value: `${zkb.points.toLocaleString()}`, inline: true }
			],
			timestamp: new Date(killmail.killmail_time),
			url: url
		};

		res = await fetch(DISCORD_WEBHOOK_URL, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ embeds: [embed], username: 'zKillBot' })
			//body: JSON.stringify({ content: url })
		});

		console.log(`Posted killmail ${killmail.killmail_id} to Discord`);
	} catch (e) {
		console.log(e);
	}
}

function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

pollRedisQ();


