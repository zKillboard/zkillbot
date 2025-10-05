import { readdirSync } from "fs";
import path from "path";
import { sendWebhook } from "../util/webhook.js";

const EPHERMERAL = 64;

async function handleImports(directory) {
	const object = {};
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
		const sub = interaction.options.getSubcommand();

		try {
			if (interaction.isAutocomplete()) {
				if (autocompletes[sub]) {
					autocompletes[sub].autocomplete(db, interaction);
				}
				return;
			}
			if (!interaction.isChatInputCommand()) return;
			if (interaction.commandName !== "zkillbot") return;

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

				return interaction.reply({
					content: await interactions[sub].interaction(db, interaction),
					flags: EPHERMERAL
				});
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
