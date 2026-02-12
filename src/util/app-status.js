import { discord_posts_queue } from "../services/discord-post.js";

export let app_status = {
	r2_count: 0,
	discord_post_count: 0,
	r2_polling: true,
	exiting: false
};

let statusIntervalId = null;

export function shareAppStatus() {
	const line = "📡" +
		"R2 polls:".padEnd(20) + String(app_status.r2_count).padStart(5) +
		"  Discord Queue:".padEnd(20) + String(discord_posts_queue.length).padStart(5) +
		"  Discord Posts:".padEnd(20) + String(app_status.discord_post_count).padStart(5);

	console.info(line);

	app_status.r2_count = 0;
	app_status.discord_post_count = 0;

	if (statusIntervalId) clearTimeout(statusIntervalId);
	statusIntervalId = setTimeout(shareAppStatus, 33333);
}

statusIntervalId = setTimeout(shareAppStatus, 33333);

export function stopAppStatus() {
	if (statusIntervalId) {
		clearTimeout(statusIntervalId);
		statusIntervalId = null;
	}
}
