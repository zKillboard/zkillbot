#!/usr/bin/env node
import { GatewayIntentBits, REST, Routes, Subscription } from "discord.js";
import { ZKILLBOT_DISCORD_CLIENT } from "./classes/zkillbot_discord_client.js";
import { loadSlashCommands } from "./services/discord-commands.js";
import { handleInteractions } from "./services/discord-interactions.js";
import { doDiscordPosts } from "./services/discord-post.js";
import { sendWebhook } from "./util/webhook.js";
import { sleep } from "./util/helpers.js";

import dotenv from "dotenv";
dotenv.config({ quiet: true });

import { pollRedisQ } from "./services/pollRedisQ.js";
import { entityUpdates } from "./services/information.js";

import "./util/shutdown.js";

import { readFileSync } from "fs";
const pkg = JSON.parse(readFileSync("./package.json", "utf8"));
const { name, version } = pkg;
export const ZKILLBOT_VERSION = `${name} v${version}`;
console.log(ZKILLBOT_VERSION);

const { DISCORD_BOT_TOKEN, CLIENT_ID, MONGO_URI, MONGO_DB, REDISQ_URL } = process.env;
export const { ZKILLBOT_CHANNEL_WEBHOOK } = process.env;

if (!DISCORD_BOT_TOKEN || !CLIENT_ID || !REDISQ_URL || !MONGO_URI || !MONGO_DB) {
	console.error("❌ Missing required env vars");
	process.exit(1);
}

export const client = new ZKILLBOT_DISCORD_CLIENT({
	intents: [GatewayIntentBits.Guilds]
});

async function init() {
	try {
		const rest = new REST({ version: "10" }).setToken(DISCORD_BOT_TOKEN);
		console.log("🔄 Registering slash commands...");
		doDiscordPosts(client.db);

		if (process.env.NODE_ENV === "development") {
			await rest.put(
				Routes.applicationGuildCommands(CLIENT_ID, process.env.GUILD_ID),
				{ body: await loadSlashCommands() }
			);
			console.log("✅ DEVELOPMENT Slash commands registered.");
		} else {
			await rest.put(
				Routes.applicationCommands(CLIENT_ID),
				{ body: await loadSlashCommands() }
			);
			console.log("✅ Slash commands registered.");
		}

		client.once("clientReady", async () => {
			console.log(`✅ Logged in as ${client.user.tag}`);

			const { initMongo } = await import("./util/mongo.js"); // await here!
			client.db = await initMongo(MONGO_URI, MONGO_DB);

			entityUpdates(client.db);

			if (process.env.NODE_ENV !== "development") {
				// allow previous instances of zKillBot to finish
				await sleep(15000);
			}
			sendWebhook(ZKILLBOT_CHANNEL_WEBHOOK, `*${ZKILLBOT_VERSION} activating - acquiring ~~targets~~ killmails*`);

			pollRedisQ(client.db, REDISQ_URL);
			
		});

		client.login(DISCORD_BOT_TOKEN);

		handleInteractions(client);
	} catch (err) {
		console.error("Failed to register commands:", err);
	}
}
init();
