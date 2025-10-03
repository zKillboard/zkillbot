import { readdirSync } from "fs";
import path from "path";

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
							flags: 64 // ephemeral
						});
					}
				}

				return interaction.reply({
					content: await interactions[sub].interaction(db, interaction),
					flags: 64 // ephemeral
				});
			}
		} catch (e) {
			console.error(e);
		}
	});
}
