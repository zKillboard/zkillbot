import { ISK_PREFIX, LABEL_PREFIX, LABEL_FILTERS } from "../../util/constants.js";
import { getFirstString } from "../../util/helpers.js";
import { getNames } from "../information.js";
import { log } from "../../util/discord.js";

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
				log(interaction `/unsubscribe iskValue`);
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
				log(interaction, `/unsubscribe label ${label_filter}`);
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
			let names = await getNames(db, [entityId]);
			let name = names[entityId] || entityId;
			log(interaction, `/unsubscribe entityId ${entityId}`);
			return `❌ Unsubscribed this channel from **${name} (${entityId})**`;
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
		cleanupReport('Empty label check', await db.subsCollection.updateMany({ labels: { $size: 0 } }, { $unset: { labels: "" } }));

		// Cleanup any empty entityId arrays
		cleanupReport('Empty entityId check', await db.subsCollection.updateMany({ entityIds: { $size: 0 } }, { $unset: { entityIds: 1 } }));
		
		// Cleanup any subscriptions with iskValue of 0 or less
		cleanupReport('Invalid iskValue check', await db.subsCollection.updateMany({ iskValue: { $lt: 100000000 } }, { $unset: { iskValue: 1 } }));

		// Updated empty subscriptions to be cleared after 24 hours
		// This gives someone a chance to re-add a subscription when they remove the last one,
		// therefore they don't need to `/zkillbot check` again. 
		// Only set cleanupAt if it isn't already set, so we don't extend the time indefinitely
		cleanupReport('Empty subscriptions check', await db.subsCollection.updateMany(
			{
				$and: [
					{ entityIds: { $exists: false } },
					{ iskValue: { $exists: false } },
					{ labels: { $exists: false } },
					{ cleanupAt: { $exists: false } }
				]
			},
			{ $set: { cleanupAt: new Date(Date.now() + 24 * 60 * 60 * 1000) } }
		));

		// Delete any subscriptions that have been empty for more than 24 hours
		// and don't have any existing subscriptions
		cleanupReport('Removing empty subscriptions', await db.subsCollection.deleteMany({
			$and: [
				{ entityIds: { $exists: false } },
				{ iskValue: { $exists: false } },
				{ labels: { $exists: false } },
				{ cleanupAt: { $lte: new Date() } }
			]
		}));

		// unset cleanupAt on any non-empty subscriptions
		await db.subsCollection.updateMany(
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

function cleanupReport(comment, res) {
	if (res.modifiedCount > 0) {
		console.log(`cleanupSubscriptions: ${comment} - affected ${res.modifiedCount} subscriptions`);
	}
}