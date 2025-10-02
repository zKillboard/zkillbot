import { discord_posts_queue } from "../zkillbot.js";

export let app_status = {
	redisq_count: 0,
	discord_post_count: 0,
	redisq_polling: true,
	exiting: false
};
export function shareAppStatus() {
	const line = "📡" +
		" RedisQ polls:".padEnd(20) + String(app_status.redisq_count).padStart(5) +
		"  Discord Queue:".padEnd(20) + String(discord_posts_queue.length).padStart(5) +
		"  Discord Posts:".padEnd(20) + String(app_status.discord_post_count).padStart(5);

	console.log(line);

	app_status.redisq_count = 0;
	app_status.discord_post_count = 0;

	setTimeout(shareAppStatus, 33333);
}
setTimeout(shareAppStatus, 33333);
