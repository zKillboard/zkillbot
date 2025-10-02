#!/usr/bin/env node
import { Client, GatewayIntentBits, REST, Routes, PermissionFlagsBits, Subscription } from "discord.js";
import { SLASH_COMMANDS } from "./services/discord-commands.js";
import { handleInteractions } from "./services/discord-interactions.js";
import NodeCache from "node-cache";

import dotenv from "dotenv";
dotenv.config({ quiet: true });

import { shareAppStatus, app_status } from "./util/shareAppStatus.js"; 
import { HEADERS, SEVEN_DAYS, LOCALE } from "./util/constants.js";
import { pollRedisQ } from "./services/pollRedisQ.js";
import { sleep, unixtime, getIDs } from "./util/helpers.js";

const { DISCORD_BOT_TOKEN, CLIENT_ID } = process.env;
export const { REDISQ_URL, MONGO_URI, MONGO_DB } = process.env;

// listen for both SIGINT and SIGTERM
["SIGINT", "SIGTERM"].forEach(sig => {
	process.on(sig, () => gracefulShutdown(sig));
});

async function gracefulShutdown(signal) {
	try {
		if (app_status.exiting) return; // already cleaning up
		app_status.exiting = true;

		console.log(`⏹️ Preparing to shut down on ${signal}...`);

		// wait for redisq_polling to finish and queue to drain (with 10s timeout)
		const shutdownTimeout = Date.now() + 30_000;
		while ((app_status.redisq_polling || discord_posts_queue.length > 0) && Date.now() < shutdownTimeout) {
			await sleep(100);
		}
		
		shareAppStatus();
	} catch (err) {
		console.error("⚠️ Error during shutdown cleanup:", err);
	}

	console.log("✅ Shutdown complete.");
	process.exit(0);
}

if (!DISCORD_BOT_TOKEN || !CLIENT_ID || !MONGO_URI || !MONGO_DB) {
	console.error("❌ Missing required env vars");
	process.exit(1);
}

export const client = new Client({
	intents: [GatewayIntentBits.Guilds],
});


async function entityUpdates(db) {
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
	if (Date.now() - names_cache_clear > 3600_000) {
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

function fillNames(names, entity) {
	let ret = {};
	for (let [key, value] of Object.entries(entity)) {
		ret[key] = value;
		ret[key.replace('_id', '_name')] = (names[value] || '???');
	}
	return ret;
}

const rest = new REST({ version: "10" }).setToken(DISCORD_BOT_TOKEN);

(async () => {
	try {
		console.log("🔄 Registering slash commands...");

		if (process.env.NODE_ENV === "development") {
			await rest.put(
				Routes.applicationGuildCommands(CLIENT_ID, process.env.GUILD_ID),
				{ body: SLASH_COMMANDS }
			);
			console.log("✅ DEVELOPMENT Slash commands registered.");
		} else {
			await rest.put(
				Routes.applicationCommands(CLIENT_ID),
				{ body: SLASH_COMMANDS }
			);
			console.log("✅ Slash commands registered.");
		}
	} catch (err) {
		console.error("Failed to register commands:", err);
	}
})();

client.once("clientReady", async () => {
	console.log(`✅ Logged in as ${client.user.tag}`);

	const { initMongo } = await import("./util/mongo.js"); // await here!
	client.db = await initMongo(MONGO_URI, MONGO_DB, SEVEN_DAYS);

	await entityUpdates(client.db);
	pollRedisQ(client.db);
});

client.login(DISCORD_BOT_TOKEN);

export async function getSystemDetails(solar_system_id) {
	let system = await getJsonCached(`https://esi.evetech.net/universe/systems/${solar_system_id}`);
	let constellation = await getJsonCached(`https://esi.evetech.net/universe/constellations/${system.constellation_id}`);
	let region = await getJsonCached(`https://esi.evetech.net/universe/regions/${constellation.region_id}`);

	return { system, constellation, region };
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

export const discord_posts_queue = [];
async function doDiscordPosts() {
	try {
		while (discord_posts_queue.length > 0) {
			const { db,  channelId, killmail, zkb, colorCode } = discord_posts_queue.shift();

			// ensure we haven't posted this killmail to this channel yet
			try {
				await db.sentHistory.insertOne({ channelId: channelId, killmail_id: killmail.killmail_id, createdAt: new Date() });
			} catch (err) {
				if (err.code === 11000) {
					// ⚠️ Duplicate key → already sent to this channel
				} else {
					console.error("Insert/send failed:", err);
				}
				continue; // loop without waiting
			}

			let embed = await getKillmailEmbeds(killmail, zkb, colorCode);
			postToDiscord(channelId, embed); // lack of await is on purpose
			break; // break loops, pause for the interval and then start again
		}
	} catch (e) {
		console.error(e);
	} finally {
		setTimeout(doDiscordPosts, 100);
	}
}
doDiscordPosts();

const embeds_cache = new NodeCache({ stdTTL: 30 });

async function getKillmailEmbeds(killmail, zkb, colorCode) {
	let embed = embeds_cache.get(killmail.killmail_id);
	if (!embed) {
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
			getSystemNameAndRegion(killmail.solar_system_id)
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
		const others = attacker_count > 0 ? ' along with ' + attacker_count + ' other ' + (solo > 0 ? 'npc' : 'pilot') + (attacker_count > 1 ? 's' : '') : '';

		const image = `https://images.evetech.net/types/${killmail.victim.ship_type_id}/icon`;

		const description = `${victim.character_name} (${victim_employer}) lost their ${victim.ship_type_name} in ${system}. Final Blow by ${fb.character_name} (${fb_employer})${solo} in their ${fb.ship_type_name}${others}. Total Value: ${zkb.totalValue.toLocaleString(LOCALE)} ISK`;

		embed = {
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

		embeds_cache.set(killmail.killmail_id, embed);
	}
	return embed;
}

async function postToDiscord(channelId, embed) {
	try {
		let remove = false;
		try {
			const channel = await client.channels.fetch(channelId);

			if (channel && channel.isTextBased()) {
				const canSend = channel.permissionsFor(client.user)?.has([
					PermissionFlagsBits.ViewChannel,
					PermissionFlagsBits.SendMessages,
					PermissionFlagsBits.EmbedLinks
				]);

				if (canSend) {
					await channel.send({
						embeds: [embed]
					});
					app_status.discord_post_count++;
				} else {
					remove = true;
				}
			} else {
				// We shouldn't even be here!
				remove = true;
			}
		} catch (err) {
			if (err.code == 50001) {
				remove = true;
			} else {
				// Something went wrong... keep the error in the logs but don't remove subscriptions just yet
				console.error(`Failed to send embed to ${channelId}:`, err);
			}
		}
		if (remove) {
			await db.subsCollection.deleteMany({ channelId: channelId });
			console.error(`Removing subscriptions for ${channelId}`);
		}
	} catch (e) {
		console.log(e);
	}
}

handleInteractions(client);

async function getSystemNameAndRegion(solar_system_id) {
	let system = await getJsonCached(`https://esi.evetech.net/universe/systems/${solar_system_id}`);
	let constellation = await getJsonCached(`https://esi.evetech.net/universe/constellations/${system.constellation_id}`, HEADERS);
	let region = await getJsonCached(`https://esi.evetech.net/universe/regions/${constellation.region_id}`, HEADERS);

	return `${system.name} (${region.name})`;
}

