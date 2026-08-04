import { ChannelType } from "discord.js";
import { log } from "../../util/discord.js";

export const requiresManageChannelPermission = true;
export const shouldDefer = true;

const hasSubscription = {
	$or: [
		{ entityIds: { $exists: true } },
		{ iskValue: { $exists: true } },
		{ labels: { $exists: true } },
		{ advanced: { $exists: true } },
	]
};

export function command(sub) {
	return sub
		.setName("copy-config")
		.setDescription("Copy this channel's configuration to another or all subscribed channels")
		.addChannelOption(opt => opt
			.setName("target")
			.setDescription("Channel to copy to")
			.addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
		)
		.addBooleanOption(opt => opt
			.setName("all")
			.setDescription("Copy to all channels with subscriptions")
		);
}

export async function interaction(db, interaction) {
	const { guildId, channelId } = interaction;
	const target = interaction.options.getChannel("target");
	const all = interaction.options.getBoolean("all") === true;

	if (!target && !all) return "⚠️ Select a target channel or set `all` to `True`.";
	if (target && all) return "⚠️ Select either a target channel or `all`, not both.";
	if (target?.id === channelId) return "⚠️ The target must be a different channel.";
	if (target && !target.permissionsFor(interaction.member).has("ManageChannels")) {
		log(interaction, `/copy-config skipped <#${target.id}>: missing Manage Channels permission`);
		return `❌ You need the **Manage Channels** permission in <#${target.id}>.`;
	}
	if (target && !await db.subsCollection.findOne({ guildId, channelId: target.id, ...hasSubscription })) {
		log(interaction, `/copy-config skipped <#${target.id}>: no subscriptions`);
		return `⚠️ <#${target.id}> does not have any subscriptions.`;
	}

	const config = await db.channels.findOne({ channelId }) || {};
	delete config._id;
	delete config.guildId;
	delete config.channelId;

	const targetIds = target
		? [target.id]
		: await db.subsCollection.distinct("channelId", {
			guildId,
			...hasSubscription,
		});
	let destinations = targetIds.filter(id => id !== channelId);
	const skippedPermission = [];
	const skippedUnavailable = [];

	if (all) {
		const guildChannels = await interaction.guild.channels.fetch();
		destinations = destinations.filter(id => {
			const channel = guildChannels.get(id);
			if (!channel) {
				log(interaction, `/copy-config skipped <#${id}>: channel unavailable`);
				skippedUnavailable.push(id);
				return false;
			}
			if (!channel.permissionsFor(interaction.member).has("ManageChannels")) {
				log(interaction, `/copy-config skipped <#${id}>: missing Manage Channels permission`);
				skippedPermission.push(id);
				return false;
			}
			return true;
		});
	}

	if (destinations.length === 0) {
		const failures = ["⚠️ Configuration was not copied to any channel."];
		if (skippedPermission.length > 0) failures.push(`Missing **Manage Channels** permission: ${skippedPermission.map(id => `<#${id}>`).join(", ")}.`);
		if (skippedUnavailable.length > 0) failures.push(`Unavailable subscribed channels: ${skippedUnavailable.map(id => `<#${id}>`).join(", ")}.`);
		return failures.length > 1 ? failures.join("\n") : "⚠️ No other subscribed channels were found.";
	}

	const copyResults = await Promise.all(destinations.map(async id => {
		try {
			await db.channels.replaceOne(
				{ channelId: id },
				{ guildId, channelId: id, ...config },
				{ upsert: true }
			);
			log(interaction, `/copy-config succeeded for <#${id}>`);
			return { id, copied: true };
		} catch (error) {
			log(interaction, `/copy-config failed for <#${id}>: ${error.message || error}`);
			return { id, copied: false };
		}
	}));

	const copied = copyResults.filter(result => result.copied).map(result => result.id);
	const failed = copyResults.filter(result => !result.copied).map(result => result.id);
	const result = copied.length > 0
		? [`✅ Configuration copied to: ${copied.map(id => `<#${id}>`).join(", ")}.`]
		: ["⚠️ Configuration was not copied to any channel."];
	if (failed.length > 0) result.push(`❌ Failed to save configuration: ${failed.map(id => `<#${id}>`).join(", ")}.`);
	if (skippedPermission.length > 0) result.push(`⚠️ Missing **Manage Channels** permission: ${skippedPermission.map(id => `<#${id}>`).join(", ")}.`);
	if (skippedUnavailable.length > 0) result.push(`⚠️ Unavailable subscribed channels: ${skippedUnavailable.map(id => `<#${id}>`).join(", ")}.`);
	return result.join("\n");
}
