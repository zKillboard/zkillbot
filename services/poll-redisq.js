import { HEADERS } from "../util/constants.js";
import { app_status } from "../util/app-status.js";
import { getSystemDetails } from "./information.js";
import { discord_posts_queue } from "./discord-post.js";

export async function pollRedisQ(db, REDISQ_URL) {
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
				const matchingSubs = await db.subsCollection
					.find({ entityIds: { $in: victimEntities } })
					.toArray();
				for (const match of matchingSubs) {
					let colorCode = 15548997; // red
					const channelId = match.channelId;
					discord_posts_queue.push({ db, channelId, killmail, zkb, colorCode });
				}
			}

			const attackerEntities = [
				...killmail.attackers.map(a => a.faction_id),
				...killmail.attackers.map(a => a.alliance_id),
				...killmail.attackers.map(a => a.corporation_id),
				...killmail.attackers.map(a => a.character_id),
				...killmail.attackers.map(a => a.ship_type_id)
			].map(Number).filter(Boolean);

			const { system, constellation } = await getSystemDetails(db, killmail.solar_system_id);
			attackerEntities.push(zkb.locationID);
			attackerEntities.push(killmail.solar_system_id);
			attackerEntities.push(system.constellation_id);
			attackerEntities.push(constellation.region_id);

			// Attackers
			{
				const matchingSubs = await db.subsCollection
					.find({ entityIds: { $in: attackerEntities } })
					.toArray();
				for (const match of matchingSubs) {
					let colorCode = 5763719; // green
					const channelId = match.channelId;
					discord_posts_queue.push({ db, channelId, killmail, zkb, colorCode });
				}
			}

			// ISK
			{
				const matchingSubs = await db.subsCollection
					.find({
						iskValue: { $gte: 100000000, $lte: zkb.totalValue }
					})
					.toArray();
				for (const match of matchingSubs) {
					let colorCode = 12092939; // gold
					const channelId = match.channelId;
					discord_posts_queue.push({ db, channelId, killmail, zkb, colorCode });
				}
			}

			// Labels
			{
				const labels = zkb.labels.filter(Boolean);
				if (labels.length > 0) { // length of 0 shouldn't happen, but just in case
					const matchingSubs = await db.subsCollection
						.find({ labels: { $in: labels } })
						.toArray();
					for (const match of matchingSubs) {
						let colorCode = 3569059; // dark blue
						const channelId = match.channelId;
						discord_posts_queue.push({ db, channelId, killmail, zkb, colorCode });
					}
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
		if (app_status.exiting) app_status.redisq_polling = false;
		else setTimeout(pollRedisQ.bind(null, db, REDISQ_URL), wait);
	}
}
