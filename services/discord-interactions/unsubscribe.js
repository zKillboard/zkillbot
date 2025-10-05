import { ISK_PREFIX, LABEL_PREFIX, LABEL_FILTERS } from "../../util/constants.js";
import { getFirstString } from "../../util/helpers.js";

export const requiresManageChannelPermission = true;

export function command(sub) {
	return sub
		.setName("unsubscribe")
		.setDescription("Unsubscribe by name, ID, or prefixed with isk: or label:")
		.addStringOption(opt =>
			opt
				.setName("filter")
				.setDescription("Unsubscribe by name, ID, or prefixed with isk: or label:")
				.setRequired(true)
				.setAutocomplete(true)
		)
}

export async function interaction(db, interaction) {
	try {
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
	} finally {
		cleanupSubscriptions(db);
	}
}

async function cleanupSubscriptions(db) {
	try {
		// Cleanup any empty label arrays
		await db.subscriptions.updateMany({ labels: { $size: 0 } }, { $unset: { labels: "" } });

		// Cleanup any empty entityId arrays
		await db.subscriptions.updateMany({ entityIds: { $size: 0 } }, { $unset: { entityIds: 1 } });

		// Updated empty subscriptions to be cleared after 24 hours
		// This gives someone a chance to re-add a subscription when they remove the last one,
		// therefore they don't need to `/zkillbot check` again. 
		// Only set cleanupAt if it isn't already set, so we don't extend the time indefinitely
		await db.subscriptions.updateMany(
			{
				$and: [
					{ entityIds: { $exists: false } },
					{ iskValue: { $exists: false } },
					{ labels: { $exists: false } },
					{ cleanupAt: { $exists: false } }
				]
			},
			{ $set: { cleanupAt: new Date(Date.now() + 24 * 60 * 60 * 1000) } }
		);

		// Delete any subscriptions that have been empty for more than 24 hours
		// and don't have any existing subscriptions
		await db.subscriptions.deleteMany({
			$and: [
				{ entityIds: { $exists: false } },
				{ iskValue: { $exists: false } },
				{ labels: { $exists: false } },
				{ cleanupAt: { $lte: new Date() } }
			]
		});

		// unset cleanupAt on any non-empty subscriptions
		await db.subscriptions.updateMany(
			{
				$or: [
					{ entityIds: { $exists: true } },
					{ iskValue: { $exists: true } },
					{ labels: { $exists: true } }
				],
				cleanupAt: { $exists: true }
			},
			{ $unset: { cleanupAt: "" } }
		);
	} catch (e) {
		console.error('cleanupEmptySubscriptions error:', e);
	}
}