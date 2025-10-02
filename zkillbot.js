#!/usr/bin/env node
import { Client, GatewayIntentBits, REST, Routes, Subscription } from "discord.js";
import { SLASH_COMMANDS } from "./services/discord-commands.js";
import { handleInteractions } from "./services/discord-interactions.js";

import dotenv from "dotenv";
dotenv.config({ quiet: true });

import { SEVEN_DAYS } from "./util/constants.js";
import { pollRedisQ } from "./services/pollRedisQ.js";
import { entityUpdates } from "./services/information.js";

const { DISCORD_BOT_TOKEN, CLIENT_ID } = process.env;
export const { REDISQ_URL, MONGO_URI, MONGO_DB } = process.env;

if (!DISCORD_BOT_TOKEN || !CLIENT_ID || !REDISQ_URL || !MONGO_URI || !MONGO_DB) {
	console.error("❌ Missing required env vars");
	process.exit(1);
}

export const client = new Client({
	intents: [GatewayIntentBits.Guilds],
});


async function init() {
	try {
		const rest = new REST({ version: "10" }).setToken(DISCORD_BOT_TOKEN);
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

		client.once("clientReady", async () => {
			console.log(`✅ Logged in as ${client.user.tag}`);

			const { initMongo } = await import("./util/mongo.js"); // await here!
			client.db = await initMongo(MONGO_URI, MONGO_DB, SEVEN_DAYS);

			entityUpdates(client.db);
			pollRedisQ(client.db);
		});

		client.login(DISCORD_BOT_TOKEN);

		handleInteractions(client);
	} catch (err) {
		console.error("Failed to register commands:", err);
	}
}
init();
