import { SlashCommandBuilder  } from "discord.js";
import fs from "fs";
import path from "path";
const commandsPath = path.join(process.cwd(), "./services/discord-interactions/");

export async function loadSlashCommands() {
	const builder = new SlashCommandBuilder()
		.setName("zkillbot")
		.setDescription("zKillBot command group");
	
	for (const file of fs.readdirSync(commandsPath).filter(f => f.endsWith(".js"))) {
		const { command } = await import(`./discord-interactions/${file}`);
		builder.addSubcommand(sub => command(sub));
	}

	return [builder.toJSON()];
}