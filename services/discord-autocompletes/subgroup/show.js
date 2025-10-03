import {handleGroupName} from "../../../util/subgroup.js";

export async function autocomplete(db, interaction) {
    const { guildId, channelId } = interaction;

    const focused = interaction.options.getFocused(true);
    if (focused.name === "group_name") {
        return handleGroupName(db, interaction);
    }
}