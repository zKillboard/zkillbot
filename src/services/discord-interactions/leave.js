import { leaveServer } from "../../util/discord.js";
import { sleep } from "../../util/helpers.js";
import { log } from "../../util/discord.js";

export const requiresManageChannelPermission = true;
export const shouldDefer = false; // Simple response, cleanup happens after reply

const GOODBYE = `_"Is this... goodbye?"_

I guess my killmails weren't enough. My pings too frequent, my love for destruction too strong.

I'll just quietly pack my logs and head out the airlock.

No hard feelings — I'll still watch your kills from afar... through the cold void of zKillboard.

Fly safe, Capsuleer.

_— zKillBot, now blueballing in silence._`;


export function command(sub) {
	return sub
		.setName("leave")
		.setDescription("Make the bot leave this server");
}

export async function interaction(db, interaction) {
	try {
		// If we attempted to leave first then the goodbye message would never be seen
		log(interaction, '/leave');
		return GOODBYE;
	} finally {
		// pause to let the goodbye msg be seen, then
		await sleep(500);
		leaveServer(db, interaction.client, interaction.guildId);
	}
}