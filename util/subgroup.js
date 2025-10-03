export async function handleGroupName(db, interaction) {
    const sub = await db.subsCollection.findOne({channelId: interaction.channel.id});
    const groupName = interaction.options.getString('group_name');
    if (!sub || !sub.subgroups) return interaction.respond([]);
    interaction.respond(Object.keys(sub.subgroups)
        .filter(g => g.toLowerCase().includes(groupName.toLowerCase()))
        .map(g => ({name: g, value: g}))
        .splice(0, 25)
    );

}