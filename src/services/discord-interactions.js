import { readdirSync } from "fs";
import path from "path";
import { sendWebhook } from "../util/webhook.js";
import { log, logInteraction } from "../util/discord.js";
import { configOptions, addSetting } from "./discord-interactions/config-channel.js";

import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
} from "discord.js";

const EPHERMERAL = 64;

async function handleImports(directory) {
	const object = {};
	// @ts-ignore
	const dir = new URL(directory, import.meta.url).pathname;

	for (const file of readdirSync(dir)) {
		if (file.endsWith(".js")) {
			const name = path.basename(file, ".js");
			object[name] = await import(`${dir}/${file}`);
		}
	}
	return object;
}

export async function handleInteractions(client) {
	const autocompletes = await handleImports("./discord-autocompletes");
	const interactions = await handleImports("./discord-interactions");

	// --- interaction handling ---
	client.on("interactionCreate", async (interaction) => {
		const db = interaction.client.db;
		let sub = null;

		try {
			if (interaction.isAutocomplete()) {
				sub = interaction.options.getSubcommand();
				if (autocompletes[sub]) {
					await autocompletes[sub].autocomplete(db, interaction);
				}
				return;
			}

			// Handles configurations
			if (interaction.isStringSelectMenu()) {
				const [prefix, setting] = interaction.customId.split(":");
				if (prefix !== "config") return;

				const value = interaction.values[0]; 
				
				await db.channels.updateOne(
					{ channelId: interaction.channelId },
					{ $set: { [setting]: value } },
					{ upsert: true }
				);

				logInteraction(db, interaction, `Modified ${setting} to ${value}`);
				log(interaction, `Modified ${setting} to ${value}`);

				await interaction.deferUpdate();
				return;
			}

			// --- pagination for config-channel ---
			if (interaction.isButton()) {
				const match = interaction.customId.match(/^config_(next|prev)_(\d+)$/);
				if (match) {
					const [, direction, pageStr] = match;
					let page = Number(pageStr);
					page = direction === "next" ? page + 1 : page - 1;

					const config = await db.channels.findOne({ channelId: interaction.channelId }) || {};
					const entries = Object.entries(configOptions);
					const perPage = 4;
					const totalPages = Math.ceil(entries.length / perPage);

					const start = page * perPage;
					const slice = entries.slice(start, start + perPage);
					const rows = [];

					for (const [key, label] of slice) {
						addSetting(rows, label, key, config);
					}

					const nav = new ActionRowBuilder();
					if (page > 0)
						nav.addComponents(
							new ButtonBuilder()
								.setCustomId(`config_prev_${page}`)
								.setLabel("⬅️ Back")
								.setStyle(ButtonStyle.Primary)
						);
					if (page < totalPages - 1)
						nav.addComponents(
							new ButtonBuilder()
								.setCustomId(`config_next_${page}`)
								.setLabel("Next ➡️")
								.setStyle(ButtonStyle.Primary)
						);
					if (nav.components.length) rows.push(nav);

					await interaction.update({
						content: `Select your configuration options. Page ${page + 1}/${totalPages}.`,
						components: rows
					});

					return;
				}
			}


			if (!interaction.isChatInputCommand()) return;
			if (interaction.commandName !== "zkillbot") return;

			sub = interaction.options.getSubcommand();
			if (interactions[sub]) {
				if (interactions[sub].requiresManageChannelPermission) {
					const canManageChannel = interaction.channel
						.permissionsFor(interaction.member)
						.has("ManageChannels");
					if (!canManageChannel) {
						return interaction.reply({
							content: "❌ ACCESS DENIED - insufficient permissions - **MANAGE CHANNEL** permission required ❌",
							flags: EPHERMERAL
						});
					}
				}

				let response = await interactions[sub].interaction(db, interaction);
				try {
					if (response !== 'IGNORE') {
						return interaction.reply({
							content: response,
							flags: EPHERMERAL
						});
					}
				} finally {
					logInteraction(db, interaction, `Running ${sub} command`, interaction.options.data?.options, response); 
				}
			}
		} catch (err) {
			console.error('command:', sub, '\n', err);

			// no await on purpose, don't want to hold up the reply
			sendWebhook(process.env.DISCORD_ERROR_WEBHOOK, `‼️ ERROR - an error occurred while processing **${sub} command:\n${err}`, false);

			try {
				return interaction.reply({
					content: "‼️ ERROR - an error occurred while processing your request ‼️",
					flags: EPHERMERAL
				});
			} catch (innerErr) {
				// probably already replied
				console.error('Error sending error message:', innerErr);
			}
		}
	});
}
