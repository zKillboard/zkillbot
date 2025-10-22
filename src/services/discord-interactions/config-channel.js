import {
	ActionRowBuilder,
	StringSelectMenuBuilder,
	ButtonBuilder,
	ButtonStyle,
} from "discord.js";

import { logInteraction } from "../../util/discord.js";

export const requiresManageChannelPermission = true;

export const configOptions = {
	header_victim: "Victim in Header",
	title: 'Title',
	description: "Full Description",
	image: "Image",
	destroyed: "Destroyed",
	dropped: "Dropped",
	fitted: "Fitted",
	involved: "Involved",
	points: "Points",
	total_value: "Total Value",
	system: 'System',
	constellation: 'Constellation',
	region: 'Region',
	footer_final_blow: "Final Blow in Footer",
	timestamp: "Timestamp",
	linkify_character: "Character Links",
	linkify_corporation: "Corporation Links",
	linkify_alliance: "Alliance Links",
	linkify_ship: "Ship Links",
	linkify_system: "System Links",
	linkify_region: "Region Links",
};

const defaultValues = {
	system: 'hide',
	constellation: 'hide',
	region: 'hide',
	linkify_character: 'hide',
	linkify_corporation: 'hide',
	linkify_alliance: 'hide',
	linkify_ship: 'hide',
	linkify_system: 'hide',
	linkify_region: 'hide',
}

export function command(sub) {
	return sub
		.setName("config-channel")
		.setDescription("Configurable options for displaying killmails in this channel")
}

export async function interaction(db, interaction) {
	const config = await db.channels.findOne({ channelId: interaction.channelId }) || {};

	let page = 0;
	const perPage = 4; // ✅ only 4 dropdowns per page (so we have room for nav row)
	const entries = Object.entries(configOptions);
	const totalPages = Math.ceil(entries.length / perPage);

	const buildPage = (page) => {
		const start = page * perPage;
		const slice = entries.slice(start, start + perPage);
		const rows = [];

		for (const [key, label] of slice) {
			const defaultValue = defaultValues[key] || 'display';
			addSetting(rows, label, key, config);
		}

		// ✅ add nav buttons, but ensure total rows ≤ 5
		const nav = new ActionRowBuilder();
		if (page > 0)
			nav.addComponents(new ButtonBuilder().setCustomId(`config_prev_${page}`).setLabel("⬅️ Back").setStyle(ButtonStyle.Primary));
		if (page < totalPages - 1)
			nav.addComponents(new ButtonBuilder().setCustomId(`config_next_${page}`).setLabel("Next ➡️").setStyle(ButtonStyle.Primary));

		if (nav.components.length) rows.push(nav);
		return rows.slice(0, 5); // safety net
	};

	logInteraction(db, interaction, '/config-channel');

	await interaction.reply({
		content: `Select your configuration options. Page ${page + 1}/${totalPages}. All options default to Show.`,
		components: buildPage(page),
		flags: 64
	});

	return 'IGNORE';
}

export function addSetting(rows, name, setting, config) {
	const current = config[setting] || (defaultValues[setting] || 'display');
	const displayed = current === 'display' ? (defaultValues[setting] == 'hide' ? 'Hidden' : 'Displayed') : 'Hidden';

	rows.push(new ActionRowBuilder().addComponents(
		new StringSelectMenuBuilder()
			.setCustomId(`config:${setting}`)
			.setPlaceholder(`Configure ${name} (Currently ${displayed})`)
			.addOptions([
				{ label: `Display ${name}`, value: `display` },
				{ label: `Hide ${name}`, value: `hide` }
			])
	));
}