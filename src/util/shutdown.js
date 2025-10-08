import { discord_posts_queue } from "../services/discord-post.js";
import { sleep } from "./helpers.js";
import { app_status, shareAppStatus } from "./app-status.js";
import { ZKILLBOT_CHANNEL_WEBHOOK, ZKILLBOT_VERSION } from "../zkillbot.js";
import { sendWebhook } from "./webhook.js";

// listen for both SIGINT and SIGTERM
["SIGINT", "SIGTERM"].forEach(sig => {
	process.on(sig, () => gracefulShutdown(sig));
});

async function gracefulShutdown(signal) {
	try {
		sendWebhook(ZKILLBOT_CHANNEL_WEBHOOK, `*${ZKILLBOT_VERSION} beginning shutdown*`);
		if (app_status.exiting) return; // already cleaning up
		app_status.exiting = true;

		console.log(`⏹️ Preparing to shut down on ${signal}...`);

		// wait for redisq_polling to finish and queue to drain (with 10s timeout)
		const shutdownTimeout = Date.now() + 30000;
		while ((app_status.redisq_polling || discord_posts_queue.length > 0) && Date.now() < shutdownTimeout) {
			await sleep(100);
		}

		shareAppStatus();
	} catch (err) {
		console.error("⚠️ Error during shutdown cleanup:", err);
	}

	// fyi to those reading the code - mongodb handles its own shutdown on process exit

	console.log("✅ Shutdown complete.");	
	await sendWebhook(ZKILLBOT_CHANNEL_WEBHOOK, `*${ZKILLBOT_VERSION} shutdown complete*`);
	await sleep(2000); // wait for webhook to send
	process.exit(0);
}
