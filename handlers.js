const Discord = require('discord.js');
const { PermissionFlagsBits, Colors, MessageFlags } = Discord;
const { version } = require('./package.json');
const env = require('./env');
const { readData, writeData } = require('./modules/data');
const modules = require('./modules/');
const main = require('./index');
const swCommands = require('./modules/SW.GENESYS/').commands;
const l5rCommands = require('./modules/L5R/').commands;
const swCharacterComponent = require('./modules/SW.GENESYS/').characterComponent;
const swDestinyComponent = require('./modules/SW.GENESYS/').destinyComponent;
const swRollComponent = require('./modules/SW.GENESYS/').rollComponent;
const swInitiativeComponent = require('./modules/SW.GENESYS/').initiativeComponent;
const swRerollComponent = require('./modules/SW.GENESYS/').rerollComponent;
const l5rRollComponent = require('./modules/L5R/').rollComponent;
const l5rRerollComponent = require('./modules/L5R/').rerollComponent;

const SYSTEM_AGNOSTIC_COMMANDS = ['stats', 'ver', 'poly', 'swrpg', 'genesys', 'l5r', 'invite', 'help', 'roll'];
const SW_GENESYS_COMMANDS = ['character', 'crit', 'shipcrit', 'species', 'gleepglop', 'destiny', 'story', 'initiative', 'reroll', 'obligation', 'duty', 'oldroll'];
const L5R_COMMANDS = ['keep', 'add', 'reroll', 'oldroll'];
const ADMIN_COMMANDS = ['restart'];

//Routes button clicks and modal submissions from the interactive /character, /destiny, and /roll menus.
//Prefixed customIds let this stay a simple dispatch table as more features grow their own UIs.
const onComponent = async ({ interaction, client }) => {
    if (interaction.customId.startsWith('char:')) return swCharacterComponent({ interaction, client });
    if (interaction.customId.startsWith('destiny:')) return swDestinyComponent({ interaction, client });
    if (interaction.customId.startsWith('roll:')) return swRollComponent({ interaction, client });
    if (interaction.customId.startsWith('l5rroll:')) return l5rRollComponent({ interaction, client });
    if (interaction.customId.startsWith('init:')) return swInitiativeComponent({ interaction, client });
    if (interaction.customId.startsWith('reroll:')) return swRerollComponent({ interaction, client });
    if (interaction.customId.startsWith('l5rreroll:')) return l5rRerollComponent({ interaction, client });
    if (interaction.customId === modules.feedback.MODAL_ID) return modules.feedback.onFeedbackSubmit(interaction, 'D1-C3');
};

//Called whenever a user triggers one of the bot's slash commands
const onInteraction = async ({ interaction, client }) => {
    if (interaction.isButton() || interaction.isModalSubmit()) return onComponent({ interaction, client });
    if (!interaction.isChatInputCommand()) return;
    //a pop-up has to be the very first answer, so /feedback skips the permission checks and deferReply below
    if (interaction.commandName === 'feedback') return interaction.showModal(modules.feedback.feedbackModal());

    //check to see if external emoji and embeds can be used (not applicable in DMs)
    if (interaction.guild && interaction.channel) {
        const permissions = interaction.channel.permissionsFor(client.user);
        if (permissions && !permissions.has(PermissionFlagsBits.UseExternalEmojis)) {
            await interaction.reply({
                embeds: [new Discord.EmbedBuilder().setColor(Colors.DarkNavy).setDescription(`Please enable \'Use External Emoji\' permission for ${client.user.username}`)],
                flags: MessageFlags.Ephemeral
            });
            return;
        }
        //this one can't be an embed - the bot lacks the very permission that would let it send one
        if (permissions && !permissions.has(PermissionFlagsBits.EmbedLinks)) {
            await interaction.reply({
                content: `Please enable \'Embed Links\' permission for ${client.user.username}`,
                flags: MessageFlags.Ephemeral
            });
            return;
        }
    }

    const command = interaction.commandName;

    //every button-driven menu is ephemeral (visible only to whoever ran the command) - each one's
    //onComponent router closes out with a public followUp() once something actually happens (a
    //roll, a pool change, a character update, ...), so the table still sees the result even though
    //the menu itself is private. A message's ephemeral flag is fixed at its first reply/deferReply
    //and can never change on later edits, so this has to be decided here before that goes out.
    // NOTE: this means these menus' buttons only work for the person who ran the command - nobody
    // else in the channel can see or click them, even for shared trackers like /destiny or /initiative.
    const EPHEMERAL_COMMANDS = ['reroll', 'character', 'destiny', 'story', 'initiative'];
    await interaction.deferReply(EPHEMERAL_COMMANDS.includes(command) ? { flags: MessageFlags.Ephemeral } : undefined);
    const messageRef = modules.asMessageRef(interaction);

    //get channelEmoji
    let channelEmoji = await readData(client, messageRef, 'channelEmoji').catch((error) => main.logError('onInteraction', error));

    console.log(`${interaction.user.username}, ${command}`);

//************************COMMANDS START HERE************************

    switch (command) {
        case 'stats':
            await modules.stats({ client, interaction });
            break;
        case 'ver':
            await main.sendMessage({ interaction, text: `${client.user.username}: version: ${version}` });
            break;
        case 'poly':
            modules.poly(interaction);
            break;
        case 'swrpg':
        case 'genesys':
        case 'l5r':
            writeData(client, messageRef, 'channelEmoji', command);
            await main.sendMessage({
                interaction, text: `${client.user.username} will now use ${command} dice`
            });
            break;
        case 'invite':
            const embed = new Discord.EmbedBuilder()
                .setColor(Colors.Grey)
                .setTitle(`**Invite**`)
                .setDescription(`Click [here](${modules.inviteUrl(client.user.id)}) to invite the bot to your server!`);
            await main.sendMessage({ interaction, embed });
            break;
    }
    let recognized = SYSTEM_AGNOSTIC_COMMANDS.includes(command);

    if (interaction.user.id === env.adminID) {
        if (ADMIN_COMMANDS.includes(command)) recognized = true;
        await modules.admin({ client, interaction, command });
    }
    switch (channelEmoji) {
        case 'swrpg':
        case 'genesys':
            if (SW_GENESYS_COMMANDS.includes(command)) recognized = true;
            await swCommands({ client, interaction, command, channelEmoji });
            break;
        case 'l5r':
            if (L5R_COMMANDS.includes(command)) recognized = true;
            await l5rCommands({ client, interaction, command, channelEmoji });
            break;
        default:
            break;
    }

    //never leave an interaction hanging if the command isn't valid here (e.g. an admin-only or
    //system-specific command used without permission or in the wrong channel mode)
    if (!recognized) {
        await main.respond(interaction, 'This command is not available in this channel.');
    }
};

//Legacy prefix command parser: this bot still supports the old ! commands so it works well with
//screen readers and environments where slash-command discovery is awkward.
const makeLegacyInteraction = (message) => {
    const prefix = env.prefix || '!';
    const content = message.content.trim();
    const body = content.startsWith(prefix) ? content.slice(prefix.length).trim() : '';
    const tokens = body.split(/\s+/).filter(Boolean);
    const command = (tokens[0] || '').toLowerCase();
    const argText = tokens.slice(1).join(' ');
    const input = command === 'roll' || command === 'oldroll' || command === 'poly' || command === 'crit' || command === 'shipcrit' || command === 'keep' || command === 'add' || command === 'help' || command === 'stats' || command === 'ver' || command === 'invite' || command === 'swrpg' || command === 'genesys' || command === 'l5r'
        ? ((tokens.length > 1 && tokens[1] && /^[A-Za-z0-9+\-\s/.,:]*$/.test(tokens[1])) ? tokens.slice(1).join(' ') : argText)
        : argText;
    const text = command === 'roll' || command === 'oldroll'
        ? (() => {
            if (tokens.length <= 2) return null;
            const firstToken = tokens[1] || '';
            const diceLooksLikeDice = /^[A-Za-z0-9+\-\s]+$/.test(firstToken) && !firstToken.includes('/') && !firstToken.includes('.') && !firstToken.includes(':');
            return diceLooksLikeDice ? tokens.slice(2).join(' ') : null;
        })()
        : null;

    return {
        guild: message.guild,
        channel: message.channel,
        user: message.author,
        member: message.member,
        options: {
            getString: (name) => {
                if (name === 'input') return input;
                if (name === 'text') return text;
                return null;
            }
        },
        reply: (payload) => message.channel.send(payload),
        editReply: (payload) => message.channel.send(payload),
        followUp: (payload) => message.channel.send(payload),
        deferReply: async () => undefined,
        deleteReply: async () => undefined,
        isChatInputCommand: () => false,
        isButton: () => false,
        isModalSubmit: () => false
    };
};

const deleteLegacyRollTrigger = async ({ message, client }) => {
    if (!message || !message.guild || !message.deletable) return;
    const permissions = message.channel && message.channel.permissionsFor
        ? message.channel.permissionsFor(client.user)
        : null;
    if (permissions && !permissions.has(PermissionFlagsBits.ManageMessages)) return;
    await message.delete().catch(() => undefined);
};

const LEGACY_COMMANDS = [
    'help', 'roll', 'oldroll', 'poly', 'crit', 'shipcrit', 'keep', 'add', 'stats', 'ver', 'invite', 'swrpg', 'genesys', 'l5r'
];

const resolveLegacyCommand = (rawCommand) => {
    const normalized = (rawCommand || '').toLowerCase();
    if (!normalized) return '';

    const matches = LEGACY_COMMANDS.filter(command => command.startsWith(normalized));
    if (!matches.length) return '';

    return matches.sort((a, b) => b.length - a.length)[0];
};

const onLegacyMessage = async ({ message, client }) => {
    if (message.author.bot) return;

    const prefix = env.prefix || '!';
    if (!message.content.startsWith(prefix)) return;

    const legacyInteraction = makeLegacyInteraction(message);
    const messageRef = modules.asMessageRef(legacyInteraction);
    const body = message.content.slice(prefix.length).trim();
    const rawCommand = (body.split(/\s+/)[0] || '').toLowerCase();
    const command = resolveLegacyCommand(rawCommand);
    const channelEmoji = await readData(client, messageRef, 'channelEmoji').catch(() => 'swrpg');

    if (!command) {
        return;
    }

    switch (command) {
        case 'help':
            if (channelEmoji === 'l5r') return l5rCommands({ client, interaction: legacyInteraction, command: 'help', channelEmoji });
            return swCommands({ client, interaction: legacyInteraction, command: 'help', channelEmoji });
        case 'roll': {
            const result = channelEmoji === 'l5r'
                ? l5rCommands({ client, interaction: legacyInteraction, command: 'oldroll', channelEmoji })
                : swCommands({ client, interaction: legacyInteraction, command: 'oldroll', channelEmoji });
            await result;
            await deleteLegacyRollTrigger({ message, client });
            return result;
        }
        case 'oldroll':
            if (channelEmoji === 'l5r') return l5rCommands({ client, interaction: legacyInteraction, command: 'oldroll', channelEmoji });
            return swCommands({ client, interaction: legacyInteraction, command: 'oldroll', channelEmoji });
        case 'poly':
            return modules.poly(legacyInteraction);
        case 'swrpg':
        case 'genesys':
        case 'l5r':
            writeData(client, messageRef, 'channelEmoji', command);
            return message.channel.send(`${client.user.username} will now use ${command} dice`);
        case 'ver':
            return message.channel.send(`${client.user.username}: version: ${version}`);
        case 'invite':
            return message.channel.send(`Invite: ${modules.inviteUrl(client.user.id)}`);
        case 'stats':
            return modules.stats({ client, interaction: legacyInteraction });
        default:
            if (channelEmoji === 'l5r') return l5rCommands({ client, interaction: legacyInteraction, command, channelEmoji });
            return swCommands({ client, interaction: legacyInteraction, command, channelEmoji });
    }
};

exports.onInteraction = onInteraction;
exports.onLegacyMessage = onLegacyMessage;
