import { readdirSync } from "fs";
import path from "path";
import {lstatSync} from "fs";

async function handleImports(directory, prefix = "") {
	let object = {};
	const dir = new URL(directory, import.meta.url).pathname;

	for (const file of readdirSync(dir)) {
		if (file.endsWith(".js")) {
			const name = path.basename(file, ".js");
			object[prefix+name] = await import(`${dir}/${file}`);
            continue;
		}
        const subdir = path.join(dir, file)
        if (lstatSync(subdir).isDirectory()) {
            object = Object.assign(object, await handleImports(subdir, file+"_"));
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
        const subGroup = interaction.options.getSubcommandGroup();
        let sub = null;
        if (subGroup) {
            sub = subGroup + '_' + interaction.options.getSubcommand();
        } else {
            sub = interaction.options.getSubcommand();
        }

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

                const reply = await interactions[sub].interaction(db, interaction);
                if (reply) {
                    return interaction.reply({
                        content: reply,
                        flags: 64 // ephemeral
                    });
                }
			}
		} catch (e) {
			console.error(e);
		}
	});
}
