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
				killmail.victim.character_id
			].map(Number).filter(Boolean);

			let match = victimEntities.find(id => entityIds.includes(id));
			let colorCode;
			if (match) {
				colorCode = 15548997; // red
			} else {
				colorCode = 5763719; // green
				const attackerEntities = [
					...killmail.attackers.map(a => a.faction_id),
					...killmail.attackers.map(a => a.alliance_id),
					...killmail.attackers.map(a => a.corporation_id),
					...killmail.attackers.map(a => a.character_id)
				].map(Number).filter(Boolean);
				match = attackerEntities.find(id => entityIds.includes(id));
			}

			if (match || process.env.TESTING == 'true') {
				await postToDiscord(killmail, zkb, colorCode);
			}
		}
	} catch (err) {
		console.error("Error polling RedisQ:", err);
		wait = 5000;
	} finally {
		setTimeout(pollRedisQ, wait);
	}
}

async function postToDiscord(killmail, zkb, colorCode) {
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
		const title = $('title').text().trim();
		let split = title.split(' | ');
		let hookTitle = split[1] + ' lost their ' + split[0];
		const description = $('meta[name="og:description"]').attr("content");
		const image = $('meta[name="og:image"]').attr("content");

		const embed = {
			title: hookTitle,
			description: description,
			color: colorCode,
			thumbnail: { url: image, height: 64, width: 64 },
			fields: [
				{ name: "Destroyed", value: `${zkb.destroyedValue.toLocaleString()} ISK`, inline: true },
				{ name: "Dropped", value: `${zkb.droppedValue.toLocaleString()} ISK`, inline: true },
				{ name: "Fitted", value: `${zkb.fittedValue.toLocaleString()} ISK`, inline: true },
				{ name: "Involved", value: `${killmail.attackers.length.toLocaleString()}`, inline: true },
				{ name: "Points", value: `${zkb.points.toLocaleString()}`, inline: true },
				{ name: "Killmail Value", value: `${zkb.totalValue.toLocaleString()} ISK`, inline: true },
			],
			timestamp: new Date(killmail.killmail_time),
			url: url,
			author: { name: 'zKillBot', icon_url: 'https://zkillboard.com/img/logo.png', url: url },
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


