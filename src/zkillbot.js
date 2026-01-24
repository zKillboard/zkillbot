#!/usr/bin/env node
import { GatewayIntentBits, REST, Routes, Options } from "discord.js";
import { ZKILLBOT_DISCORD_CLIENT } from "./classes/zkillbot_discord_client.js";
import { loadSlashCommands } from "./services/discord-commands.js";
import { handleInteractions } from "./services/discord-interactions.js";
import { doDiscordPosts } from "./services/discord-post.js";
import { sendWebhook } from "./util/webhook.js";
import { sleep } from "./util/helpers.js";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import cron from "node-cron";
import v8 from "v8";
import { writeHeapSnapshot } from "v8";

// @ts-ignore
dotenv.config({ quiet: true, path: new URL("../.env", import.meta.url).pathname });

import { pollRedisQ } from "./services/poll-redisq.js";

import "./util/shutdown.js";

import { readFileSync } from "fs";
// @ts-ignore
import { Db } from "mongodb";
// @ts-ignore
import { error } from "console";
const pkg = JSON.parse(readFileSync("./package.json", "utf8"));
const { name, version } = pkg;
export const ZKILLBOT_VERSION = `${name} v${version}`;
console.log(ZKILLBOT_VERSION);

const { DISCORD_BOT_TOKEN, CLIENT_ID, MONGO_URI, MONGO_DB, REDISQ_URL } = process.env;
export const { ZKILLBOT_CHANNEL_WEBHOOK } = process.env;

// Memory debugging utilities
let memorySnapshots = [];
let snapshotCount = 0;

function formatBytes(bytes) {
	return (bytes / 1024 / 1024).toFixed(2) + ' MB';
}

function logMemoryUsage() {
	const usage = process.memoryUsage();
	const heapStats = v8.getHeapStatistics();
	
	console.log('\n📊 Memory Usage:');
	console.log('  RSS:', formatBytes(usage.rss), '(Resident Set Size - total memory allocated)');
	console.log('  Heap Used:', formatBytes(usage.heapUsed), '/', formatBytes(usage.heapTotal));
	console.log('  External:', formatBytes(usage.external), '(C++ objects bound to JS)');
	console.log('  Array Buffers:', formatBytes(usage.arrayBuffers));
	console.log('  Heap Size Limit:', formatBytes(heapStats.heap_size_limit));
	console.log('  Used Heap Size:', formatBytes(heapStats.used_heap_size));
	console.log('  Malloced Memory:', formatBytes(heapStats.malloced_memory));
	
	// Track growth
	const currentSnapshot = {
		timestamp: new Date().toISOString(),
		rss: usage.rss,
		heapUsed: usage.heapUsed,
		heapTotal: usage.heapTotal,
		external: usage.external,
		arrayBuffers: usage.arrayBuffers
	};
	
	memorySnapshots.push(currentSnapshot);
	
	// Keep only last 10 snapshots
	if (memorySnapshots.length > 10) {
		memorySnapshots.shift();
	}
	
	// Show growth trends
	if (memorySnapshots.length > 1) {
		const oldest = memorySnapshots[0];
		const growth = {
			rss: currentSnapshot.rss - oldest.rss,
			heapUsed: currentSnapshot.heapUsed - oldest.heapUsed,
			heapTotal: currentSnapshot.heapTotal - oldest.heapTotal,
			external: currentSnapshot.external - oldest.external,
			arrayBuffers: currentSnapshot.arrayBuffers - oldest.arrayBuffers
		};
		
		console.log('\n📈 Growth since', oldest.timestamp + ':');
		console.log('  RSS:', growth.rss > 0 ? '+' : '', formatBytes(growth.rss));
		console.log('  Heap Used:', growth.heapUsed > 0 ? '+' : '', formatBytes(growth.heapUsed));
		console.log('  Heap Total:', growth.heapTotal > 0 ? '+' : '', formatBytes(growth.heapTotal));
		console.log('  External:', growth.external > 0 ? '+' : '', formatBytes(growth.external));
		console.log('  Array Buffers:', growth.arrayBuffers > 0 ? '+' : '', formatBytes(growth.arrayBuffers));
	}
	
	// Warning thresholds
	if (usage.heapUsed / usage.heapTotal > 0.9) {
		console.warn('⚠️  WARNING: Heap usage is above 90%!');
	}
	
	if (usage.heapUsed / heapStats.heap_size_limit > 0.8) {
		console.warn('⚠️  WARNING: Approaching heap size limit!');
	}
}

function takeHeapSnapshot() {
	try {
		const filename = `./heap-snapshot-${Date.now()}.heapsnapshot`;
		writeHeapSnapshot(filename);
		console.log(`📸 Heap snapshot written to ${filename}`);
		console.log('   Load in Chrome DevTools > Memory > Load to analyze object retention');
		snapshotCount++;
		
		// Limit snapshots to avoid filling disk
		if (snapshotCount > 5) {
			console.log('⚠️  Snapshot limit reached. No more snapshots will be taken automatically.');
		}
		
		return filename;
	} catch (err) {
		console.error('❌ Failed to write heap snapshot:', err);
	}
}

function startMemoryMonitoring() {
	console.log('🔍 Starting memory monitoring...');
	console.log('   Memory stats will be logged every 5 minutes');
	console.log('   Heap snapshots can be taken with SIGUSR2: kill -USR2', process.pid);
	
	// Log memory every 5 minutes
	setInterval(() => {
		logMemoryUsage();
		
		// Take automatic snapshot if memory is high and we haven't hit limit
		const usage = process.memoryUsage();
		const heapStats = v8.getHeapStatistics();
		const usedPercent = usage.heapUsed / heapStats.heap_size_limit;
		
		if (snapshotCount < 5 && usedPercent > 0.7) {
			console.log('📸 Taking automatic heap snapshot due to high memory usage...');
			takeHeapSnapshot();
		}
		
		// MEMORY LEAK FIX: Clear caches under memory pressure
		if (usedPercent > 0.85) {
			console.warn('⚠️ HIGH MEMORY PRESSURE - triggering cache cleanup');
			// Import and clear caches dynamically to avoid circular deps
			import('./util/helpers.js').then(({ clearJsonCache }) => {
				if (clearJsonCache) clearJsonCache();
			}).catch(() => {});
			import('./services/discord-post.js').then(({ clearPostCache }) => {
				if (clearPostCache) clearPostCache();
			}).catch(() => {});
			
			// Trigger manual GC if available
			if (global.gc) {
				console.log('🗑️ Triggering manual garbage collection');
				global.gc();
			}
		}
	}, 5 * 60 * 1000); // 5 minutes
	
	// Allow manual heap snapshot via signal
	process.on('SIGUSR2', () => {
		console.log('📸 Received SIGUSR2, taking heap snapshot...');
		takeHeapSnapshot();
		logMemoryUsage();
	});
	
	// Initial log
	setTimeout(() => logMemoryUsage(), 5000);
}

if (!DISCORD_BOT_TOKEN || !CLIENT_ID || !REDISQ_URL || !MONGO_URI || !MONGO_DB) {
	console.error("❌ Missing required env vars");
	process.exit(1);
}

// MEMORY LEAK FIX: Add cache sweepers and limits to prevent Discord.js memory leaks
export const client = new ZKILLBOT_DISCORD_CLIENT({
	intents: [GatewayIntentBits.Guilds],
	// Sweep caches periodically to prevent accumulation
	sweepers: {
		messages: {
			interval: 3600, // Every hour
			lifetime: 1800  // Remove messages older than 30 min
		},
		users: {
			interval: 3600,
			filter: () => user => user.bot && user.id !== client.user?.id
		}
	},
	// Limit cache sizes to prevent unbounded growth
	makeCache: Options.cacheWithLimits({
		MessageManager: 100,
		GuildMemberManager: 200,
		UserManager: 200,
		PresenceManager: 0,
		GuildBanManager: 0,
		ReactionManager: 0,
		ApplicationCommandManager: 0,
		StageInstanceManager: 0,
		ThreadManager: 0,
		ThreadMemberManager: 0,
	})
});

async function init() {
	try {
		const rest = new REST({ version: "10" }).setToken(DISCORD_BOT_TOKEN);
		console.log("🔄 Registering slash commands...");

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

			if (process.env.NODE_ENV !== "development") {
				// allow previous instances of zKillBot to finish
				await sleep(15000);
			}
			sendWebhook(ZKILLBOT_CHANNEL_WEBHOOK, `*${ZKILLBOT_VERSION} activating - acquiring ~~targets~~ killmails*`);

			// Start memory monitoring
			startMemoryMonitoring();

			pollRedisQ(client.db, REDISQ_URL);
			initCrons(client.db, client);
		});

		client.login(DISCORD_BOT_TOKEN);

		handleInteractions(client);
	} catch (err) {
		console.error("Failed to register commands:", err);
		if (err.code == 50001) {
			console.error("Invite the bot back to your server...", process.env.INVITE);			
		}
		process.exit(1);
	}
}
init();

async function initCrons(db, client) {
	// load and init each cron from the crons directory
	const crons_path = path.join(process.cwd(), "./src/crons/");
	for (const file of fs.readdirSync(crons_path).filter(f => f.endsWith(".js"))) {
		const { init } = await import(`${crons_path}/${file}`);
		await init(db, client);
		doDiscordPosts(db);
	}
}

/* Discord is throwing exceptions outside the promise chain, catch them here */
process.on('uncaughtException', async (err) => {
	// @ts-ignore
	if (err.code === 10008 || err.code == 40060) {
		console.warn('⚠️ Ignored uncaught Discord exception:', err.message);
		return; // Unknown Message, can be ignored
	}
	console.error('🔥 Uncaught Exception:', err);
	await sendWebhook(ZKILLBOT_CHANNEL_WEBHOOK, `**${ZKILLBOT_VERSION} encountered an uncaught exception.**`);
});

process.on('unhandledRejection', async (reason, promise) => {
	console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
	await sendWebhook(ZKILLBOT_CHANNEL_WEBHOOK, `**${ZKILLBOT_VERSION} encountered an unhandled promise rejection and is shutting down.**`);
	// send sigterm to app for graceful shutdown
	process.kill(process.pid, 'SIGTERM');
});

// Schedule a shutdown at 11:01 UTC daily for downtime just to purge GC and reset state
// A cron will bring us back up at 11:02 UTC
cron.schedule("1 11 * * *", () => {
	console.log("11:01 downtime, shutting down");
	process.kill(process.pid, "SIGTERM");
});