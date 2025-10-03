import {getFirstString} from "../../../util/helpers.js";
import {EmbedBuilder} from "discord.js";
import {getNames} from "../../information.js";

export async function interaction(db, interaction) {
    const { channelId } = interaction;

    let doc = await db.subsCollection.findOne({ channelId: channelId });
    if (!doc || doc.checked != true) {
        return ' 🛑 Before you show a subscription group, please run `/zkillbot check`` to ensure all permissions are set properly for this channel and create a subscription group.';
    }

    let subGroup = getFirstString(interaction, ["group_name"]);
    if (!doc.subgroups || !Object.keys(doc.subgroups).includes(subGroup)) {
        return `🛑 Subscription group **${subGroup}** does not exists`;
    }

    const subgroupObj = doc.subgroups[subGroup];

    const names = await getNames(db, subgroupObj.entityIds || [])
    const embed =new EmbedBuilder()
        .setTitle(`📜 Subscription Group: ${subGroup}`)
        .setDescription((subgroupObj.entityIds && subgroupObj.entityIds.length > 0 ? subgroupObj.entityIds.map((e, i) => `\`${names[e]}\``).join('\n') : 'No entities set.').substring(0,4096))
        .addFields(
            {name: "ISK Threshold", value: (subgroupObj.iskValue ? `\`${subgroupObj.iskValue.toLocaleString()} ISK\`` : 'No ISK threshold set.').substring(0, 1024), inline: true},
            {name: "Labels", value: (subgroupObj.labels && subgroupObj.labels.length > 0 ? subgroupObj.labels.map((l, i) => `\`${l}\``).join('\n') : 'No labels set.').substring(0, 1024), inline: true},
            {name: "Status", value: (subgroupObj.enabled ? '🟢 Enabled' : '🔴 Disabled').substring(0, 1024), inline: false},
        )
    interaction.reply({embeds: [embed]})
    return null;
}
