import { SlashCommandBuilder  } from "discord.js";

// --- slash command definitions ---
export const SLASH_COMMANDS = [
	new SlashCommandBuilder()
		.setName("zkillbot")
		.setDescription("zKillBot command group")
		.addSubcommand(sub =>
			sub
				.setName("invite")
				.setDescription("Get the invite link for zKillBot")
		)
		.addSubcommand(sub =>
			sub
				.setName("subscribe")
				.setDescription("Subscribe by name, ID, or prefixed with isk: or label:")
				.addStringOption(opt =>
					opt
						.setName("filter")
						.setDescription("Subscribe by name, ID, or prefixed with isk: or label:")
						.setRequired(true)
						.setAutocomplete(true)
				)
		)
		.addSubcommand(sub =>
			sub
				.setName("unsubscribe")
				.setDescription("Unsubscribe by name, ID, or prefixed with isk: or label:")
				.addStringOption(opt =>
					opt
						.setName("filter")
						.setDescription("Unsubscribe by name, ID, or prefixed with isk: or label:")
						.setRequired(true)
						.setAutocomplete(true)
				)
		)
		.addSubcommand(sub =>
			sub
				.setName("list")
				.setDescription("List all subscriptions in this channel")
		)
		.addSubcommand(sub =>
			sub
				.setName("check")
				.setDescription("Check if the bot has permission to send messages in this channel")
		)
		.addSubcommand(sub =>
			sub
				.setName("remove_all_subs")
				.setDescription("Clears all subscriptions in this channel")
		)
        .addSubcommandGroup(sub =>
            sub
                .setName("subgroup")
                .setDescription('Manage subscription groups')
                .addSubcommand(sub =>
                    sub
                        .setName('create')
                        .setDescription('Create a new subscription group')
                        .addStringOption(opt =>
                        opt
                            .setName("group_name")
                            .setDescription("Name of the subscription group")
                            .setRequired(true)
                        )
                )
                .addSubcommand(sub =>
                    sub
                        .setName('delete')
                        .setDescription('Delete a subscription group')
                        .addStringOption(opt =>
                            opt
                                .setName("group_name")
                                .setDescription("Name of the subscription group")
                                .setAutocomplete(true)
                                .setRequired(true)
                        )
                )
                .addSubcommand(sub =>
                    sub
                        .setName('add')
                        .setDescription('Add by name, ID, or prefixed with isk: or label: to a group')
                        .addStringOption(opt =>
                            opt
                                .setName("group_name")
                                .setDescription("Name of the subscription group")
                                .setAutocomplete(true)
                                .setRequired(true)
                        )
                        .addStringOption(opt =>
                            opt
                                .setName("filter")
                                .setDescription("Subscribe by name, ID, or prefixed with isk: or label:")
                                .setRequired(true)
                                .setAutocomplete(true)
                        )
                )
                .addSubcommand(sub =>
                    sub
                        .setName('remove')
                        .setDescription('remove by name, ID, or prefixed with isk: or label: to a group')
                        .addStringOption(opt =>
                            opt
                                .setName("group_name")
                                .setDescription("Name of the subscription group")
                                .setAutocomplete(true)
                                .setRequired(true)
                        )
                        .addStringOption(opt =>
                            opt
                                .setName("filter")
                                .setDescription("Unsubscribe by name, ID, or prefixed with isk: or label:")
                                .setRequired(true)
                                .setAutocomplete(true)
                        )
                )
        )
		.toJSON()
];