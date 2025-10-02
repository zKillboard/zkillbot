#!/usr/bin/env node
import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { MongoClient } from "mongodb";
import NodeCache from "node-cache";

import dotenv from "dotenv";

dotenv.config({ quiet: true });

const { DISCORD_BOT_TOKEN, CLIENT_ID, MONGO_URI, MONGO_DB, REDISQ_URL, LOCALE } = process.env;

const HEADERS = {
	headers: {
		"User-Agent": "zKillBot",
		"Accept": "application/json"
	}
}

let exiting = false;
let redisq_polling = true;

const LABEL_FILTERS = [
	"#:1", "#:10+", "#:100+", "#:1000+", "#:2+", "#:25+", "#:5+", "#:50+",
	"atShip", "awox", "bigisk", "capital",
	"cat:11", "cat:18", "cat:22", "cat:23", "cat:350001", "cat:40", "cat:46", "cat:6", "cat:65", "cat:87",
	"concord", "extremeisk", "ganked", "insaneisk",
	"isk:100b+", "isk:10b+", "isk:1b+", "isk:1t+", "isk:5b+",
	"loc:abyssal", "loc:drifter", "loc:highsec", "loc:lowsec", "loc:nullsec", "loc:w-space",
	"npc", "padding", "pvp", "solo",
	"tz:au", "tz:eu", "tz:ru", "tz:use", "tz:usw"
];

async function gracefulShutdown(signal) {
	try {
		if (exiting) return; // already cleaning up
		exiting = true;

		console.log(`⏹️ Preparing to shut down on ${signal}...`);

		// wait for redisq_polling to finish and queue to drain (with 10s timeout)
		const shutdownTimeout = Date.now() + 30_000;
		while ((redisq_polling || discord_posts_queue.length > 0) && Date.now() < shutdownTimeout) {
			await sleep(100);
		}
		
		shareAppStatus();
	} catch (err) {
		console.error("⚠️ Error during shutdown cleanup:", err);
	}

	console.log("✅ Shutdown complete.");
	process.exit(0);
}

// listen for both SIGINT and SIGTERM
["SIGINT", "SIGTERM"].forEach(sig => {
	process.on(sig, () => gracefulShutdown(sig));
});


if (!DISCORD_BOT_TOKEN || !CLIENT_ID || !MONGO_URI || !MONGO_DB) {
	console.error("❌ Missing required env vars");
	process.exit(1);
}

const client = new Client({
	intents: [GatewayIntentBits.Guilds],
});

const SEVEN_DAYS = 604800;
function unixtime() {
	return Math.floor(Date.now() / 1000);
}

// --- Mongo connection ---
const mongo = new MongoClient(MONGO_URI);
let subsCollection, sentHistory, entities;

async function initMongo() {
	await mongo.connect();
	const db = mongo.db(MONGO_DB);

	entities = db.collection('entities');
	await entities.createIndex({ entity_id: 1 });
	await entities.createIndex({ last_updated: 1 });

	sentHistory = db.collection('subshistory');
	await sentHistory.createIndex({ channelId: 1, killmail_id: 1 }, { unique: true });
	await sentHistory.createIndex({ createdAt: 1 }, { expireAfterSeconds: SEVEN_DAYS }); // 7 days

	subsCollection = db.collection("subscriptions");
	await subsCollection.createIndex({ entityIds: 1 });
	await subsCollection.createIndex({ iskValue: 1 });
	await subsCollection.createIndex({ labels: 1 });
	console.log("✅ Connected to MongoDB");
}

let app_status = { redisq_count: 0, discord_post_count: 0 };
function shareAppStatus() {
	const line =
		"📡" +
		" RedisQ polls:".padEnd(20) + String(app_status.redisq_count).padStart(5) +
		"  Discord Queue:".padEnd(20) + String(discord_posts_queue.length).padStart(5) +
		"  Discord Posts:".padEnd(20) + String(app_status.discord_post_count).padStart(5);

	console.log(line);
	app_status = { redisq_count: 0, discord_post_count: 0 };
	setTimeout(shareAppStatus, 33333);
}
setTimeout(shareAppStatus, 33333);

async function entityUpdates() {
	try {
		const oneWeekAgo = unixtime() - SEVEN_DAYS;

		const staleEntities = await entities
			.find({ last_updated: { $lt: oneWeekAgo } })
			.limit(500)
			.toArray();

		if (staleEntities.length == 0) return;

		const entityIds = staleEntities.map(e => e.entity_id);
		const names = await getNames(entityIds);
		for (const n of names) {
			entities.updateOne({ id: n.entity_id }, { $set: { name: n.name, last_updated: unixtime() } });
		}
	} finally {
		setTimeout(entityUpdates, 1000);
	}
}

let names_cache = {};
let names_cache_clear = Date.now();
async function getNames(entities, use_cache = true) {
	// Keep the cache from getting too large
	if (Date.now() - names_cache_clear > 3600_000) {
		names_cache = {};
		names_cache_clear = Date.now();
	}

	// unique IDs
	const ids = [...new Set(entities)];

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

// --- slash command definitions ---
const commands = [
	new SlashCommandBuilder()
		.setName("zkillbot")
		.setDescription("zKillBot command group")
		.addSubcommand(sub =>
			sub
				.setName("invite")
				.setDescription("Get the invite link for zKillBot")
		)
		
		.addSubcommand(sub =>
			sub
				.setName("subscribe")
				.setDescription("Subscribe by name, ID, or prefixed with isk: or label:")
				.addStringOption(opt =>
					opt.setName("filter").setDescription("Subscribe by name, ID, or prefixed with isk: or label:").setRequired(true)
				)
		)
		.addSubcommand(sub =>
			sub
				.setName("unsubscribe")
				.setDescription("Unsubscribe by name, ID, or prefixed with isk: or label:")
				.addStringOption(opt =>
					opt.setName("filter").setDescription("Unsubscribe by name, ID, or prefixed with isk: or label:").setRequired(true)
				)
		)
		.addSubcommand(sub =>
			sub
				.setName("list")
				.setDescription("List all subscriptions in this channel")
		)
		.addSubcommand(sub =>
			sub
				.setName("check")
				.setDescription("Check if the bot has permission to send messages in this channel")
		)
		.addSubcommand(sub =>
			sub
				.setName("remove_all_subs")
				.setDescription("Clears all subscriptions in this channel")
		)
		.toJSON()
];

const rest = new REST({ version: "10" }).setToken(DISCORD_BOT_TOKEN);

(async () => {
	try {
		console.log("🔄 Registering slash commands...");

		if (process.env.NODE_ENV === "development") {
			await rest.put(
				Routes.applicationGuildCommands(CLIENT_ID, process.env.GUILD_ID),
				{ body: commands }
			);
			console.log("✅ DEVELOPMENT Slash commands registered.");
		} else {
			await rest.put(
				Routes.applicationCommands(CLIENT_ID),
				{ body: commands }
			);
			console.log("✅ Slash commands registered.");
		}
	} catch (err) {
		console.error("Failed to register commands:", err);
	}
})();

client.once("clientReady", async () => {
	console.log(`✅ Logged in as ${client.user.tag}`);
	await initMongo();
	await entityUpdates();
	pollRedisQ();
});

const ISK_PREFIX = 'isk:', LABEL_PREFIX = 'label:';

// --- interaction handling ---
client.on("interactionCreate", async (interaction) => {
	try {
		if (!interaction.isChatInputCommand()) return;
		if (interaction.commandName !== "zkillbot") return;

		const guildId = interaction.guildId;
		const channelId = interaction.channelId;
		const sub = interaction.options.getSubcommand();

		if (sub === "invite") {
			const inviteUrl = process.env.INVITE;

			await interaction.reply({
				content: `🔗 Invite me to your server:\n${inviteUrl}`,
				flags: 64
			});
		}

		if (sub === "list") {
			const doc = await subsCollection.findOne({ guildId, channelId });
			let entityIds = doc?.entityIds || [];

			// 🔑 resolve IDs to names
			const names = await getNames(entityIds);
			let lines = (entityIds || [])
				.map(id => `• ${id} — ${names[id] ?? "Unknown"}`)
				.join("\n");
			if (doc?.iskValue) {
				lines += `\nisk: >= ${doc?.iskValue}`;
			}
			if (doc?.labels && doc?.labels?.length > 0) {
				lines += '\nlabels: ' + doc.labels.join(', ');
			}
			if (lines.length == 0) {
				return interaction.reply({
					content: `📋 You have no subscriptions in this channel`,
					flags: 64
				});
			}

			return interaction.reply({
				content: `📋 Subscriptions in this channel:\n${lines}`,
				flags: 64
			});
		}

		const canManageChannel = interaction.channel
			.permissionsFor(interaction.member)
			.has("ManageChannels");
		

		if (sub === "check") {
			const channel = interaction.channel;

			const perms = channel.permissionsFor(interaction.guild.members.me);

			const canView = perms?.has("ViewChannel");
			const canSend = perms?.has("SendMessages");
			const canEmbed = perms?.has("EmbedLinks");
			const isTextBased = channel.isTextBased();

			await interaction.reply({
				content: [
					`🔍 Permission check for <#${channel.id}>`,
					`• View Channel: ${canView ? "✅" : "❌ (allow zkillbot#0066 to view channel)"}`,
					`• Send Messages: ${canSend ? "✅" : "❌ (allow zkillbot#0066 to send messages)"}`,
					`• Embed Links: ${canEmbed ? "✅" : "❌ (allow zkillbot#0066 to embed links)"}`,
					`• Text Based Channel: ${isTextBased ? "✅" : "❌ (channel is not a text based channel)"}`,
					`• You do ` + (canManageChannel ? '' : 'not ' ) + `have permissions to [un]subscribe for this channel`
				].join("\n"),
				flags: 64
			});

			if (canView && canSend && canEmbed && isTextBased && canManageChannel) {
				await subsCollection.updateOne(
					{ guildId, channelId },
					{ $set: { checked: true } },
					{ upsert: true }
				);
			}
		}

		if (!canManageChannel) {
			return interaction.reply({
				content: "❌ ACCESS DENIED - insufficient permissions ❌",
				flags: 64 // ephemeral
			});
		}

		if (sub === "subscribe") {
			let doc = await subsCollection.findOne({ channelId: channelId });
			if (!doc || doc.checked != true) {
				return interaction.reply({
					content: ` 🛑 Before you subscribe, please run **/zkillbot check** to ensure all permissions are set properly for this channel`,
					flags: 64
				});
			}

			let valueRaw = getFirstString(interaction, ["query", "filter", "value", "entity_id"]);

			if (valueRaw.startsWith(ISK_PREFIX)) {
				const iskValue = Number(valueRaw.substr(ISK_PREFIX.length));
				if (Number.isNaN(iskValue)) {
					return interaction.reply({
						content: ` ❌ Unable to subscribe... **${valueRaw}** is not a number`,
						flags: 64
					});
				}
				if (iskValue < 100000000) {
					return interaction.reply({
						content: ` ❌ Unable to subscribe... **${valueRaw}** needs to be at least 100 million`,
						flags: 64
					});
				}

				await subsCollection.updateOne(
					{ guildId, channelId },
					{ $set: { iskValue: iskValue } },
					{ upsert: true }
				);

				return interaction.reply({
					content: `📡 Subscribed killmails having iskValue of at least ${iskValue} to channel`,
					flags: 64
				});
			} else if (valueRaw.startsWith(LABEL_PREFIX)) {
				const label_filter = valueRaw.substr(LABEL_PREFIX.length);
				if (LABEL_FILTERS.indexOf(label_filter) < 0) {
					return interaction.reply({
						content: ` ❌ Unable to subscribe to label **${label_filter}**, it is not one of the following:\n` + LABEL_FILTERS.join(', '),
						flags: 64
					});
				}

				await subsCollection.updateOne(
					{ guildId, channelId },
					{ $addToSet: { labels: label_filter } },
					{ upsert: true }
				);

				return interaction.reply({
					content: `📡 Subscribed this channel to killmails having label **${label_filter}**`,
					flags: 64
				});
			} else {
				let entityId = Number(valueRaw);
				if (Number.isNaN(entityId)) {
					const res = await fetch(`https://zkillboard.com/cache/1hour/autocomplete/?query=${valueRaw}`);
					let suggestions = (await res.json()).suggestions;

					// we will add groups, but omitting for now
					suggestions = suggestions.filter(
						s => !s.value.includes("(Closed)") && s.data.type != "group"
					);

					if (suggestions.length > 1) {
						const formatted = suggestions
							.map(s => `${s.data.id} — ${s.value} (${s.data.type})`)
							.join("\n");

						return interaction.reply({
							content: ` ❕Too many results for **${valueRaw}**, pick one by ID or use a more specific query:\n${formatted}`,
							flags: 64
						});
					}

					if (suggestions.length == 0) {
						return interaction.reply({
							content: ` ❌ Unable to subscribe... **${valueRaw}** did not come up with any search results`,
							flags: 64
						});
					}
					entityId = suggestions[0].data.id;
				}

				let names = await getNames([entityId]);
				if (Object.values(names).length === 0) {
					return interaction.reply({
						content: ` ❌ Unable to subscribe... **${valueRaw}** is not a valid entity id`,
						flags: 64
					});
				}
				const name = names[entityId];

				await subsCollection.updateOne(
					{ guildId, channelId },
					{ $addToSet: { entityIds: entityId } },
					{ upsert: true }
				);

				await entities.updateOne(
					{ entity_id: entityId, name: name },
					{ $setOnInsert: { last_updated: unixtime() } },
					{ upsert: true }
				);

				return interaction.reply({
					content: `📡 Subscribed this channel to ${name}`,
					flags: 64
				});
			}
		}

		if (sub === "unsubscribe") {
			let valueRaw = getFirstString(interaction, ["query", "filter", "value", "entity_id"]);

			if (valueRaw.startsWith(ISK_PREFIX)) {
				const res = await subsCollection.updateOne(
					{ guildId, channelId },
					{ $unset: { iskValue: 1 } }
				);

				if (res.modifiedCount > 0) {
					return interaction.reply({
						content: `❌ Unsubscribed this channel from killmails of a minimum isk value`,
						flags: 64
					});
				} else {
					return interaction.reply({
						content: `⚠️ No subscription found for killmails of a minimum isk value`,
						flags: 64
					});
				}
			}

			if (valueRaw.startsWith(LABEL_PREFIX)) {
				const label_filter = valueRaw.substr(LABEL_PREFIX.length);
				const res = await subsCollection.updateOne(
					{ guildId, channelId },
					{ $pull: { labels: label_filter } }
				);

				if (res.modifiedCount > 0) {
					return interaction.reply({
						content: `❌ Unsubscribed this channel from label **${label_filter}**`,
						flags: 64
					});
				} else {
					return interaction.reply({
						content: `⚠️ No subscription found for label **${label_filter}**`,
						flags: 64
					});
				}
			}

			const entityId = Number(valueRaw);
			if (Number.isNaN(entityId)) {
				return interaction.reply({
					content: ` ❌ Unable to unsubscribe... **${valueRaw}** is not a number`,
					flags: 64
				});
			}

			const res = await subsCollection.updateOne(
				{ guildId, channelId },
				{ $pull: { entityIds: entityId } }
			);

			if (res.modifiedCount > 0) {
				return interaction.reply({
					content: `❌ Unsubscribed this channel from **${entityId}**`,
					flags: 64
				});
			} else {
				return interaction.reply({
					content: `⚠️ No subscription found for **${entityId}**`,
					flags: 64
				});
			}
		}

		if (sub === "remove_all_subs") {
			await subsCollection.deleteOne(
				{ guildId, channelId }
			);

			return interaction.reply({
				content: `❌ All subscriptions removed from this channel`,
				flags: 64
			});
		}
	} catch (e) {
		console.error(e);
	}
});

client.login(DISCORD_BOT_TOKEN);

async function pollRedisQ() {
	let wait = 500; // RedisQ allows 20 queries / 10 seconds
	try {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), 15000); // 15s timeout

		const res = await fetch(REDISQ_URL, { ...HEADERS, signal: controller.signal });
		const text = await res.text();
		if (text.trim().startsWith('<')) return;
		const data = JSON.parse(text);

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

			// Victims
			{
				const matchingSubs = await subsCollection
					.find({ entityIds: { $in: victimEntities } })
					.toArray();
				for (const match of matchingSubs) {
					let colorCode = 15548997; // red
					const channelId = match.channelId;
					discord_posts_queue.push({ channelId, killmail, zkb, colorCode });
				}
			}

			const attackerEntities = [
				...killmail.attackers.map(a => a.faction_id),
				...killmail.attackers.map(a => a.alliance_id),
				...killmail.attackers.map(a => a.corporation_id),
				...killmail.attackers.map(a => a.character_id),
				...killmail.attackers.map(a => a.ship_type_id)
			].map(Number).filter(Boolean);

			const { system, constellation } = await getSystemDetails(killmail.solar_system_id);
			attackerEntities.push(zkb.locationID);
			attackerEntities.push(killmail.solar_system_id);
			attackerEntities.push(system.constellation_id);
			attackerEntities.push(constellation.region_id);

			// Attackers
			{
				const matchingSubs = await subsCollection
					.find({ entityIds: { $in: attackerEntities } })
					.toArray();
				for (const match of matchingSubs) {
					let colorCode = 5763719; // green
					const channelId = match.channelId;
					discord_posts_queue.push({ channelId, killmail, zkb, colorCode });
				}
			}

			// ISK
			{
				const matchingSubs = await subsCollection
					.find({ iskValue: { $lte: zkb.totalValue } })
					.toArray();
				for (const match of matchingSubs) {
					let colorCode = 12092939; // gold
					const channelId = match.channelId;
					discord_posts_queue.push({ channelId, killmail, zkb, colorCode });
				}
			}

			// Labels
			{
				const matchingSubs = await subsCollection
					.find({ labels: { $in: zkb.labels } })
					.toArray();
				for (const match of matchingSubs) {
					let colorCode = 5763719; // green
					const channelId = match.channelId;
					discord_posts_queue.push({ channelId, killmail, zkb, colorCode });
				}
			}

			app_status.redisq_count++;
		}
	} catch (err) {
		if (err.name === "AbortError") {
			console.error("Fetch timed out after 15 seconds");
		} else {
			console.error("Error polling RedisQ:", err);
		}
		wait = 5000;
	} finally {
		if (exiting) redisq_polling = false;
		else setTimeout(pollRedisQ, wait);
	}
}

async function getSystemDetails(solar_system_id) {
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

const discord_posts_queue = [];
async function doDiscordPosts() {
	try {
		while (discord_posts_queue.length > 0) {
			const { channelId, killmail, zkb, colorCode } = discord_posts_queue.shift();

			// ensure we haven't posted this killmail to this channel yet
			try {
				await sentHistory.insertOne({ channelId: channelId, killmail_id: killmail.killmail_id, createdAt: new Date() });
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
			await subsCollection.deleteMany({ channelId: channelId });
			console.error(`Removing subscriptions for ${channelId}`);
		}
	} catch (e) {
		console.log(e);
	}
}


function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

function getIDs(obj) {
	return Object.entries(obj)
		.filter(([key]) => key.endsWith('_id'))
		.map(([, value]) => value);
}

async function getSystemNameAndRegion(solar_system_id) {
	let system = await getJsonCached(`https://esi.evetech.net/universe/systems/${solar_system_id}`);
	let constellation = await getJsonCached(`https://esi.evetech.net/universe/constellations/${system.constellation_id}`, HEADERS);
	let region = await getJsonCached(`https://esi.evetech.net/universe/regions/${constellation.region_id}`, HEADERS);

	return `${system.name} (${region.name})`;
}

function getFirstString(interaction, optionNames, defaultValue = "0") {
	for (const name of optionNames) {
		const value = interaction.options.getString(name);
		if (value) {
			return value.trim();
		}
	}
	return defaultValue;
}