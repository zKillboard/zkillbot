import { log } from "../../util/discord.js";

export const requiresManageChannelPermission = false;
export const shouldDefer = true; // Complex aggregation queries

import NodeCache from "node-cache";
const stats_cache = new NodeCache({ stdTTL: 900 });

export function command(sub) {
	return sub
		.setName("about")
		.setDescription("About zKillBot, the Discord bot behind zKillboard. Includes stats and a link to the documentation.")
}

export async function interaction(db, interaction) {
	let zkillbot_stats = stats_cache.get("about_stats");

	if (!zkillbot_stats) {
		const channel_stats = await db.subsCollection.aggregate([
			{
				$group: {
					_id: null,
					channelIds: { $addToSet: "$channelId" },
					totalDocs: { $sum: 1 },
					iskValueCount: {
						$sum: { $cond: [{ $ne: [{ $type: "$iskValue" }, "missing"] }, 1, 0] }
					},
					labelsCount: {
						$sum: {
							$cond: [
								{ $isArray: "$labels" },
								{ $size: "$labels" },
								{ $cond: [{ $ne: [{ $type: "$labels" }, "missing"] }, 1, 0] }
							]
						}
					},
					entityIdsCount: {
						$sum: {
							$cond: [
								{ $isArray: "$entityIds" },
								{ $size: "$entityIds" },
								{ $cond: [{ $ne: [{ $type: "$entityIds" }, "missing"] }, 1, 0] }
							]
						}
					}
				}
			},
			{
				$project: {
					_id: 0,
					channelCount: { $size: "$channelIds" },
					totalDocs: 1,
					iskValueCount: 1,
					labelsCount: 1,
					entityIdsCount: 1,
					summary: {
						totalFieldCount: {
							$add: ["$iskValueCount", "$labelsCount", "$entityIdsCount"]
						},
						breakdown: {
							iskValue: "$iskValueCount",
							labels: "$labelsCount",
							entityIds: "$entityIdsCount"
						}
					}
				}
			}
		]).next();

		const post_count_seven_days = await db.sentHistory.countDocuments();
		zkillbot_stats = {
			channel_stats,
			post_count_seven_days
		}
		stats_cache.set("about_stats", zkillbot_stats);
	}

	log(interaction, '/about');

	return `**About zKillBot**
**Discord Servers:** ${interaction.client.guilds.cache.size}
**Channels w/ Subs:** ${zkillbot_stats.channel_stats.channelCount}
**Subscription Types:**
- iskValue: ${zkillbot_stats.channel_stats.iskValueCount}
- labels: ${zkillbot_stats.channel_stats.labelsCount}
- entityIds: ${zkillbot_stats.channel_stats.entityIdsCount}
**Posts (last 3 days):** ${zkillbot_stats.post_count_seven_days}
**Documentation:** <https://zkillboard.github.io/zkillbot/>
Brought to you by [Squizz Caphinator](<https://zkillboard.com/character/1633218082/>)`;

}