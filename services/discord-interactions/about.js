export const requiresManageChannelPermission = false;

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
					guildIds: { $addToSet: "$guildId" },
					channelIds: { $addToSet: "$channelId" },
					totalDocs: { $sum: 1 }
				}
			},
			{
				$project: {
					_id: 0,
					guildCount: { $size: "$guildIds" },
					channelCount: { $size: "$channelIds" },
					totalDocs: 1
				}
			}
		]).next()

		const post_count_seven_days = await db.sentHistory.countDocuments();
		zkillbot_stats = {
			channel_stats,
			post_count_seven_days
		}
		stats_cache.set("about_stats", zkillbot_stats);
	}

	return `**About zKillBot**\n \
		**Discord Servrs:** ${zkillbot_stats.channel_stats.guildCount} \n \
		**Channels w/ Subs:** ${zkillbot_stats.channel_stats.channelCount} \n \
		**Subscriptions:** ${zkillbot_stats.channel_stats.totalDocs} \n \
		**Posts in the last 7 days:** ${zkillbot_stats.post_count_seven_days} \n \
		**Documentation:** https://zkillboard.com/information/zkillbot/
		`;
}