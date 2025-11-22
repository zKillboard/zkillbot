import { getFirstString } from "../../util/helpers.js";
import { log, check } from "../../util/discord.js";
import { parseFilters } from "../../util/filter.js";

export const requiresManageChannelPermission = true;
export const shouldDefer = true; // API calls to zkillboard.com and database operations

export function command(sub) {
	return sub
		.setName("advancedfilter")
		.setDescription("Advanced filter using a custom query")
		.addStringOption(opt =>
			opt
				.setName("advancedfilter")
				.setDescription("Advanced filter using a custom query")
				.setRequired(true)
				.setAutocomplete(true)
		)
}

export async function interaction(db, interaction) {
	const { guildId, channelId } = interaction;

	let doc = await db.subsCollection.findOne({ channelId: channelId });
	if (!doc || doc.checked != true) {
		let result = await check(db, interaction);
		if (!result.successfulCheck) {
			return result.msg;
		}
	}

	let valueRaw = getFirstString(interaction, ["advancedfilter"]).toLowerCase();

	// lets validate the filter
	try {
		const { operator, rules } = parseFilters(valueRaw);

		// if we got here, the filter is valid
		await db.subsCollection.updateOne(
			{ guildId, channelId },
			{ $set: { advancedFilter: valueRaw } },
			{ upsert: true }
		);

		log(interaction, `/advancedfilter ${valueRaw}`)
		return `📡 Advanced filter set for this channel.`;
	} catch (e) {
		return ` ❌ Unable to set advanced filter... ${e.message}`;
	}
}