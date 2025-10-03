import { ISK_PREFIX, LABEL_PREFIX, LABEL_FILTERS } from "../../util/constants.js";
import { getFirstString } from "../../util/helpers.js";

export const requiresManageChannelPermission = true;

export async function interaction(db, interaction) {
	const { guildId, channelId } = interaction;

	let valueRaw = getFirstString(interaction, ["query", "filter", "value", "entity_id"]);

	if (valueRaw.startsWith(ISK_PREFIX)) {
		const res = await db.subsCollection.updateOne(
			{ guildId, channelId },
			{ $unset: { iskValue: 1 } }
		);

		if (res.modifiedCount > 0) {
			return `❌ Unsubscribed this channel from killmails of a minimum isk value`;
		} else {
			return `⚠️ No subscription found for killmails of a minimum isk value`;
		}
	}

	if (valueRaw.startsWith(LABEL_PREFIX)) {
		const label_filter = valueRaw.substr(LABEL_PREFIX.length);
		const res = await db.subsCollection.updateOne(
			{ guildId, channelId },
			{ $pull: { labels: label_filter } }
		);

		if (res.modifiedCount > 0) {
			return `❌ Unsubscribed this channel from label **${label_filter}**`;
		} else {
			return `⚠️ No subscription found for label **${label_filter}**`;
		}
	}

	const entityId = Number(valueRaw);
	if (Number.isNaN(entityId)) {
		return ` ❌ Unable to unsubscribe... **${valueRaw}** is not a number`;
	}

	const res = await db.subsCollection.updateOne(
		{ guildId, channelId },
		{ $pull: { entityIds: entityId } }
	);

	if (res.modifiedCount > 0) {
		return `❌ Unsubscribed this channel from **${entityId}**`;
	} else {
		return `⚠️ No subscription found for **${entityId}**`;
	}
}