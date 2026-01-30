import { HEADERS } from "../util/constants.js";
import { app_status } from "../util/app-status.js";
import { fetchWithRetry } from "../util/helpers.js";
import { getShipGroup, getSystemDetails } from "./information.js";
import { discord_posts_queue, addToQueue } from "./discord-post.js";
import { matchesFilter, parseFilters } from "../util/filter.js";

let pollIntervalId = null;

let errorCount = 0;

export async function pollRedisQ(db, REDISQ_URL, sequence = 0) {
	if (app_status.exiting) {
		app_status.redisq_polling = false;
		if (pollIntervalId) {
			clearTimeout(pollIntervalId);
			pollIntervalId = null;
		}
		return;
	}

	let wait = 10000; // Default to being slow if there is no data
	let timer = null;
	try {
		if (discord_posts_queue.length > 100) {
			// we'll wait the default timeout
			return;
		}

		if (sequence == 0) {
			const row = await db.keyvalues.findOne({ key: "sequence" });
			sequence = row?.value || 0;

			if (sequence == 0) {
				const raw = await fetchWithRetry("https://r2z2.zkillboard.com/ephemeral/sequence.json");
				const seqData = await raw.json();
				sequence = seqData.sequence || 0;
				if (sequence == 0) {
					console.error("Failed to get initial RedisQ sequence number, defaulting to 0");
					return;
				}
			}
			console.log(`Starting RedisQ sequence at ${sequence}`);
		}

		let controller = new AbortController();
		timer = setTimeout(() => controller.abort(), 15000); // 15s timeout

		const res = await fetch(`https://r2z2.zkillboard.com/ephemeral/${sequence}.json`, {
			headers: HEADERS.headers,
			signal: controller.signal
		});
		clearTimeout(timer);
		timer = null;
		controller = null; // Release AbortController reference

		if (res.status !== 200) {
			errorCount++;
			if (errorCount > 50) {
				console.error("Received 404 errors more than 50 times in a row, resetting sequence to 0");
				sequence = 0;
				errorCount = 0;
				await db.keyvalues.deleteOne({ key: "sequence" });
			}
			return;
		}
		errorCount = 0;

		const text = await res.text();
		if (text.trim().startsWith('<')) return;
		const data = JSON.parse(text);

		if (data) {
			wait = 500; // Speed up polling when data is present
			const killmail = data.esi;
			const zkb = data.zkb;

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
			{
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
					addToQueue({ guildId, channelId, killmail, zkb, colorCode, matchType: 'victim' });
					}
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
			{
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
					addToQueue({ guildId, channelId, killmail, zkb, colorCode, matchType: 'attacker' });
					}
				}
			}

			// ISK
			{
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
					addToQueue({ guildId, channelId, killmail, zkb, colorCode, matchType: 'isk' });
					}
				}
			}

			// Labels
			{
				if (!zkb?.labels?.filter) zkb.labels = [];
				const labels = zkb.labels?.filter(Boolean);
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
						addToQueue({ guildId, channelId, killmail, zkb, colorCode, matchType: 'label' });
					}
				}
			}

			// ensure groups are part of the killmail
			for (const attacker of killmail.attackers) {
				const group = await getShipGroup(db, attacker.ship_type_id);
				attacker.group_id = group?.id;
				attacker.is_victim = false;
			}
			const victimGroup = await getShipGroup(db, killmail.victim.ship_type_id);
			killmail.victim.group_id = victimGroup?.id;
			killmail.victim.is_victim = true;
		
			const details = await getSystemDetails(db, killmail.solar_system_id);
			killmail.system = details.system;
			killmail.constellation_id = details.constellation.constellation_id;
			killmail.region_id = details.region.region_id; 
		
			// Advanced filters
			{
				const matchingSubs = await db.subsCollection
					.find({ advanced: { $exists: true, $ne: "" } })
					.toArray();
				for (const match of matchingSubs) {
					try {
						const filter = parseFilters(match.advanced);

						if (matchesFilter(data.package, filter)) {
							let colorCode = 5793266; // purple
							const channelId = match.channelId;
							const guildId = match.guildId;
							addToQueue({ guildId, channelId, killmail, zkb, colorCode, matchType: 'advanced' });
						}
					}
					catch (e) {
						console.error("Error parsing advanced filter:", e);
					}
				}
			}

			app_status.redisq_count++;
			sequence++;
			await db.keyvalues.updateOne(
				{ key: "sequence" },
				{ $set: { value: sequence } },
				{ upsert: true }
			);
		}
	} catch (err) {
		if (err.name === "AbortError") {
			console.error("Fetch timed out after 15 seconds");
		} else {
			console.error("Error polling RedisQ:", err);
		}
	} finally {
		if (timer) {
			clearTimeout(timer);
			timer = null;
		}
		pollIntervalId = setTimeout(() => pollRedisQ(db, REDISQ_URL, sequence), wait);
	}
}