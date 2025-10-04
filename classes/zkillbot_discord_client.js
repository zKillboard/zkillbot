import { Client } from "discord.js";

export class ZKILLBOT_DISCORD_CLIENT extends Client {
	constructor(options) {
		super(options);
		this.db = null;
	}
}
