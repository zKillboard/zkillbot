import { HEADERS } from "../util/constants.js";
import { app_status } from "../util/app-status.js";
import { getShipGroup, getSystemDetails } from "./information.js";
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

			// Add ship group
			const shipGroup = await getShipGroup(db, killmail.victim.ship_type_id);
			if (shipGroup) {
				// @ts-ignore
				victimEntities.push(`group:${shipGroup.id}`);
			}			

			// Victims
			if (victimEntities.length > 0) {
				const matchingSubs = await db.subsCollection
					.find({ entityIds: { $in: victimEntities } })
					.toArray();
				for (const match of matchingSubs) {
					let entityIds = match.entityIds.filter(Boolean) || [];
					if (entityIds.length === 0) continue;
					// lets validate that victimEntities is actually in entityIds (mistrusting mongo $in)
					const found = victimEntities.find(e => entityIds.includes(e));
					if (!found) continue;

					let colorCode = 15548997; // red
					const channelId = match.channelId;
					const guildId = match.guildId;
					discord_posts_queue.push({ db, match, guildId, channelId, killmail, zkb, colorCode, matchType: 'victim' });
				}
			}

			const attackerEntities = [
				...killmail.attackers.map(a => a.faction_id),
				...killmail.attackers.map(a => a.alliance_id),
				...killmail.attackers.map(a => a.corporation_id),
				...killmail.attackers.map(a => a.character_id),
				...killmail.attackers.map(a => a.ship_type_id)
			].map(Number).filter(Boolean);

			// Add ship groups
			for (const attacker of killmail.attackers) {
				const shipGroup = await getShipGroup(db, attacker.ship_type_id);
				if (shipGroup) {
					// @ts-ignore
					attackerEntities.push(`group:${shipGroup.id}`);
				}
			}

			const { system, constellation } = await getSystemDetails(db, killmail.solar_system_id);
			attackerEntities.push(zkb.locationID);
			attackerEntities.push(killmail.solar_system_id);
			attackerEntities.push(system.constellation_id);
			attackerEntities.push(constellation.region_id);

			// Attackers
			if (attackerEntities.length > 0) {
				const matchingSubs = await db.subsCollection
					.find({ entityIds: { $in: attackerEntities, $exists: true, $ne: [] } })
					.toArray();
				for (const match of matchingSubs) {
					if (!match.entityIds) continue; // wtf, should never happen, but it does
					let entityIds = match.entityIds.filter(Boolean) || [];
					if (entityIds.length === 0) continue;
					// lets validate that attackerEntities is actually in entityIds (mistrusting mongo $in)
					const found = attackerEntities.find(e => entityIds.includes(e));
					if (!found) continue;

					let colorCode = 5763719; // green
					const channelId = match.channelId;
					const guildId = match.guildId;
					discord_posts_queue.push({ db, match, guildId, channelId, killmail, zkb, colorCode, matchType: 'attacker' });
				}
			}

			// ISK
			if (zkb.totalValue >= 100000000) { // 100m minimum
				const matchingSubs = await db.subsCollection
					.find({
						iskValue: { $gte: 100000000, $lte: zkb.totalValue }
					})
					.toArray();
				for (const match of matchingSubs) {
					// lets validate that zkb.totalValue is actually in the range
					if (!match.iskValue) continue; // wtf, should never happen, but it does
					if (isNaN(match.iskValue)) continue;
					if (zkb.totalValue < 100000000) continue;
					if (zkb.totalValue < match.iskValue) continue;

					// if we got here, we have a match

					let colorCode = 12092939; // gold
					const channelId = match.channelId;
					const guildId = match.guildId;
					discord_posts_queue.push({ db, match, guildId, channelId, killmail, zkb, colorCode, matchType: 'isk' });
				}
			}

			// Labels
			const labels = zkb.labels.filter(Boolean);
			if (labels.length > 0) { // length of 0 shouldn't happen, but just in case
				const matchingSubs = await db.subsCollection
					.find({ labels: { $in: labels, $exists: true, $ne: [] } })
					.toArray();
				for (const match of matchingSubs) {
					let labels = match.labels.filter(Boolean) || [];
					if (labels.length === 0) continue;
					// lets validate that labels is actually in entityIds (mistrusting mongo $in)
					const found = labels.find(e => zkb.labels.includes(e));
					if (!found) continue;

					let colorCode = 3569059; // dark blue
					const channelId = match.channelId;
					const guildId = match.guildId;
					discord_posts_queue.push({ db, match, guildId, channelId, killmail, zkb, colorCode, matchType: 'label' });
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
