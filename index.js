require('dotenv').config();

const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  Events,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require('discord.js');

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const QUEUE_CHANNEL_ID = process.env.QUEUE_CHANNEL_ID;
const DELETE_ON_CLOSE = (process.env.DELETE_ON_CLOSE || 'true').toLowerCase() === 'true';
const DUO_ROLE_ID = process.env.DUO_ROLE_ID || '';
const TRIO_ROLE_ID = process.env.TRIO_ROLE_ID || '';
const STACK5_ROLE_ID = process.env.STACK5_ROLE_ID || process.env.FIVESTACK_ROLE_ID || '';

if (!TOKEN || !CLIENT_ID || !GUILD_ID || !QUEUE_CHANNEL_ID) {
  console.error('Missing required values in .env');
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

const activePosts = new Map();
const pendingLfg = new Map();

const typeChoices = [
  { label: 'Duo', value: 'duo' },
  { label: 'Trio', value: 'trio' },
  { label: '5 Stack', value: '5stack' },
];

const rankChoices = [
  { label: 'Iron', value: 'Iron' },
  { label: 'Bronze', value: 'Bronze' },
  { label: 'Silver', value: 'Silver' },
  { label: 'Gold', value: 'Gold' },
  { label: 'Plat', value: 'Plat' },
  { label: 'Diamond', value: 'Diamond' },
  { label: 'Ascendant', value: 'Ascendant' },
  { label: 'Immortal', value: 'Immortal' },
  { label: 'Radiant', value: 'Radiant' },
];

const regionChoices = [
  { label: 'NA East', value: 'NA East' },
  { label: 'NA Central', value: 'NA Central' },
  { label: 'NA West', value: 'NA West' },
  { label: 'EU', value: 'EU' },
  { label: 'OCE', value: 'OCE' },
  { label: 'APAC', value: 'APAC' },
];

const modeChoices = [
  { label: 'Competitive', value: 'Competitive' },
  { label: 'Unrated', value: 'Unrated' },
  { label: 'Swiftplay', value: 'Swiftplay' },
  { label: 'Spike Rush', value: 'Spike Rush' },
  { label: 'Deathmatch', value: 'Deathmatch' },
  { label: 'Team Deathmatch', value: 'Team Deathmatch' },
  { label: 'Premier', value: 'Premier' },
  { label: 'Custom', value: 'Custom' },
];

const commands = [
  new SlashCommandBuilder()
    .setName('lfg')
    .setDescription('Create a Looking For Group post'),
].map((cmd) => cmd.toJSON());

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(TOKEN);

  await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
    { body: commands }
  );

  console.log('Slash commands registered successfully.');
}

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);
  console.log(`CLIENT_ID: ${CLIENT_ID}`);
  console.log(`GUILD_ID: ${GUILD_ID}`);
  console.log(`QUEUE_CHANNEL_ID: ${QUEUE_CHANNEL_ID}`);

  console.log('Bot is in these servers:');
  readyClient.guilds.cache.forEach((guild) => {
    console.log(`- ${guild.name} (${guild.id})`);
  });

  try {
    await registerCommands();
  } catch (error) {
    console.error('Error registering commands:', error);
  }
});

function getTypeLabel(type) {
  if (type === 'duo') return 'Duo';
  if (type === 'trio') return 'Trio';
  return '5 Stack';
}

function getMaxPlayers(type) {
  if (type === 'duo') return 2;
  if (type === 'trio') return 3;
  return 5;
}

function modeNeedsRank(mode) {
  return mode === 'Competitive' || mode === 'Premier';
}

function getRoleNameForType(type) {
  if (type === 'duo') return 'duo';
  if (type === 'trio') return 'trio';
  if (type === '5stack') return '5stack';
  return '';
}

function getRoleIdForType(type) {
  if (type === 'duo') return DUO_ROLE_ID;
  if (type === 'trio') return TRIO_ROLE_ID;
  if (type === '5stack') return STACK5_ROLE_ID;
  return '';
}

function normalizeRoleName(input) {
  return (input || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function getRoleAliasesForType(type) {
  if (type === 'duo') return ['duo'];
  if (type === 'trio') return ['trio'];
  if (type === '5stack') return ['5stack', '5 stack', '5-stack', '5s'];
  return [];
}

async function resolveRoleForType(guild, type) {
  const roleName = getRoleNameForType(type);
  const configuredRoleId = getRoleIdForType(type);

  if (!roleName) {
    return null;
  }

  await guild.roles.fetch();

  if (configuredRoleId) {
    const byId = guild.roles.cache.get(configuredRoleId);
    if (byId) return byId;
  }

  const aliases = getRoleAliasesForType(type).map(normalizeRoleName);
  const aliasSet = new Set(aliases);

  const byAlias = guild.roles.cache.find((role) =>
    aliasSet.has(normalizeRoleName(role.name))
  );

  if (byAlias) {
    return byAlias;
  }

  return guild.roles.cache.find(
    (role) => role.name.toLowerCase() === roleName.toLowerCase()
  ) || null;
}

function getRoleMention(type, roleId) {
  return roleId ? `<@&${roleId}>` : `@${getRoleNameForType(type) || getTypeLabel(type)}`;
}

function getTypeDisplay(post) {
  if (post.roleId) {
    return `<@&${post.roleId}>`;
  }

  const roleName = post.roleName || getRoleNameForType(post.type);
  return roleName ? `@${roleName}` : getTypeLabel(post.type);
}

function buildTypeMenu(userId) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`lfg_type_${userId}`)
      .setPlaceholder('Select your group type')
      .addOptions(typeChoices)
  );
}

function buildRegionMenu(userId) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`lfg_region_${userId}`)
      .setPlaceholder('Select your region')
      .addOptions(regionChoices)
  );
}

function buildModeMenu(userId) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`lfg_mode_${userId}`)
      .setPlaceholder('Select your game mode')
      .addOptions(modeChoices)
  );
}

function buildRankMenu(userId) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`lfg_rank_${userId}`)
      .setPlaceholder('Select your rank')
      .addOptions(rankChoices)
  );
}

function buildButtons(ownerId, state = 'open') {
  const isFull = state === 'full';
  const isClosed = state === 'closed';

  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`lfg_join_${ownerId}`)
      .setLabel(isClosed ? 'Closed' : isFull ? 'Full' : 'Join')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(isFull || isClosed),
    new ButtonBuilder()
      .setCustomId(`lfg_leave_${ownerId}`)
      .setLabel('Leave')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(isClosed),
    new ButtonBuilder()
      .setCustomId(`lfg_close_${ownerId}`)
      .setLabel(isClosed ? 'Closed' : 'Close')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(isClosed)
  );
}

function buildEmbed(ownerId, post) {
  const maxPlayers = getMaxPlayers(post.type);
  const joinedMentions = post.joinedUserIds.map((id) => `<@${id}>`).join(', ');
  const isFull = post.joinedUserIds.length >= maxPlayers;
  const spotsLeft = Math.max(maxPlayers - post.joinedUserIds.length, 0);

  const lines = [
    `**Host:** <@${ownerId}>`,
    `**Type:** ${getTypeDisplay(post)}`,
    `**Region:** ${post.region}`,
    `**Mode:** ${post.mode}`,
  ];

  if (post.rank && post.rank !== 'N/A') {
    lines.push(`**Rank:** ${post.rank}`);
  }

  if (post.isClosed) {
    lines.push(
      `**Status:** Closed`,
      `**Members:** ${joinedMentions}`
    );
  } else {
    lines.push(
      `**Players:** ${post.joinedUserIds.length}/${maxPlayers}`,
      `**Status:** ${isFull ? 'Full' : `${spotsLeft} spot${spotsLeft === 1 ? '' : 's'} left`}`,
      `**Members:** ${joinedMentions}`
    );
  }

  return new EmbedBuilder()
    .setTitle(post.isClosed ? '🔒 LFG Closed' : '🎮 Looking For Group')
    .setDescription(lines.join('\n'))
    .setFooter({
      text: post.isClosed
        ? 'This group has been closed.'
        : isFull
          ? 'This group is full.'
          : 'Use the buttons below to join or leave.',
    })
    .setTimestamp();
}

async function createLfgPost(interaction, type, region, mode, rank = 'N/A') {
  const queueChannel = await client.channels.fetch(QUEUE_CHANNEL_ID);

  if (!queueChannel || !queueChannel.isTextBased()) {
    throw new Error('Queue channel not found or is not text-based.');
  }

  const me = await interaction.guild.members.fetchMe();
  const perms = queueChannel.permissionsFor(me);

  console.log('Bot permissions in queue channel:', {
    viewChannel: perms?.has('ViewChannel'),
    sendMessages: perms?.has('SendMessages'),
    embedLinks: perms?.has('EmbedLinks'),
    readMessageHistory: perms?.has('ReadMessageHistory'),
    manageMessages: perms?.has('ManageMessages'),
    mentionEveryone: perms?.has('MentionEveryone'),
  });

  if (
    !perms?.has('ViewChannel') ||
    !perms?.has('SendMessages') ||
    !perms?.has('EmbedLinks')
  ) {
    throw new Error('Bot is missing required permissions in the queue channel.');
  }

  const existing = activePosts.get(interaction.user.id);
  if (existing) {
    try {
      const oldMessage = await queueChannel.messages.fetch(existing.messageId);
      await oldMessage.delete();
    } catch (err) {
      console.log('Old LFG message could not be deleted, continuing.');
    }
  }

  const postData = {
    messageId: null,
    queueChannelId: queueChannel.id,
    joinedUserIds: [interaction.user.id],
    roleId: null,
    roleName: null,
    type,
    region,
    mode,
    rank,
    isClosed: false,
  };

  const role = await resolveRoleForType(interaction.guild, type);
  const roleId = role?.id || null;
  const roleName = role?.name || getRoleNameForType(type) || null;
  postData.roleId = roleId;
  postData.roleName = roleName;

  const roleMention = getRoleMention(type, roleId);
  const pingContent = roleId
    ? `${roleMention} Someone is looking to queue!`
    : `${roleMention} Someone is looking to queue!`;

  const sentMessage = await queueChannel.send({
    content: pingContent,
    embeds: [buildEmbed(interaction.user.id, postData)],
    components: [buildButtons(interaction.user.id, 'open')],
    allowedMentions: roleId ? { roles: [roleId] } : { parse: [] },
  });

  const followUpLine = roleId
    ? `<@${interaction.user.id}> is looking for ${roleMention} for ${mode}.`
    : `<@${interaction.user.id}> is looking for ${getTypeLabel(type)} for ${mode}.`;

  const followUpPayload = {
    content: followUpLine,
    allowedMentions: roleId
      ? { users: [interaction.user.id], roles: [roleId] }
      : { users: [interaction.user.id], parse: [] },
  };

  // Keep LFG creation successful even if the secondary ping fails.
  try {
    await sentMessage.reply(followUpPayload);
  } catch (replyErr) {
    console.log('Follow-up reply failed, trying channel send:', replyErr.message);
    try {
      await queueChannel.send(followUpPayload);
    } catch (sendErr) {
      console.log('Follow-up ping message failed:', sendErr.message);
    }
  }

  postData.messageId = sentMessage.id;
  activePosts.set(interaction.user.id, postData);

  setTimeout(async () => {
    const post = activePosts.get(interaction.user.id);
    if (!post || post.messageId !== sentMessage.id) return;

    try {
      const msg = await queueChannel.messages.fetch(sentMessage.id);
      await msg.delete();
    } catch (err) {
      console.log('Auto-delete skipped:', err.message);
    }

    activePosts.delete(interaction.user.id);
  }, 2 * 60 * 60 * 1000);

  return sentMessage;
}

async function refreshPost(ownerId) {
  const post = activePosts.get(ownerId);
  if (!post) return;

  const channel = await client.channels.fetch(post.queueChannelId);
  const msg = await channel.messages.fetch(post.messageId);

  let state = 'open';
  if (post.isClosed) {
    state = 'closed';
  } else if (post.joinedUserIds.length >= getMaxPlayers(post.type)) {
    state = 'full';
  }

  await msg.edit({
    content: msg.content || undefined,
    embeds: [buildEmbed(ownerId, post)],
    components: [buildButtons(ownerId, state)],
    allowedMentions: { parse: [] },
  });
}

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand() && interaction.commandName === 'lfg') {
      pendingLfg.set(interaction.user.id, {});

      await interaction.reply({
        content: 'Pick your group type first.',
        components: [buildTypeMenu(interaction.user.id)],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (
      interaction.isStringSelectMenu() &&
      interaction.customId === `lfg_type_${interaction.user.id}`
    ) {
      const selectedType = interaction.values[0];
      const current = pendingLfg.get(interaction.user.id) || {};

      current.type = selectedType;
      pendingLfg.set(interaction.user.id, current);

      await interaction.update({
        content: `Type selected: **${getTypeLabel(selectedType)}**\nNow pick your region.`,
        components: [buildRegionMenu(interaction.user.id)],
      });
      return;
    }

    if (
      interaction.isStringSelectMenu() &&
      interaction.customId === `lfg_region_${interaction.user.id}`
    ) {
      const selectedRegion = interaction.values[0];
      const current = pendingLfg.get(interaction.user.id);

      if (!current || !current.type) {
        await interaction.update({
          content: 'Your setup expired. Please run **/lfg** again.',
          components: [],
        });
        return;
      }

      current.region = selectedRegion;
      pendingLfg.set(interaction.user.id, current);

      await interaction.update({
        content: `Region selected: **${selectedRegion}**\nNow pick your game mode.`,
        components: [buildModeMenu(interaction.user.id)],
      });
      return;
    }

    if (
      interaction.isStringSelectMenu() &&
      interaction.customId === `lfg_mode_${interaction.user.id}`
    ) {
      const selectedMode = interaction.values[0];
      const current = pendingLfg.get(interaction.user.id);

      if (!current || !current.type || !current.region) {
        await interaction.update({
          content: 'Your setup expired. Please run **/lfg** again.',
          components: [],
        });
        return;
      }

      current.mode = selectedMode;
      pendingLfg.set(interaction.user.id, current);

      if (modeNeedsRank(selectedMode)) {
        await interaction.update({
          content: `Mode selected: **${selectedMode}**\nNow pick your rank.`,
          components: [buildRankMenu(interaction.user.id)],
        });
        return;
      }

      const sentMessage = await createLfgPost(
        interaction,
        current.type,
        current.region,
        current.mode,
        'N/A'
      );

      pendingLfg.delete(interaction.user.id);

      await interaction.update({
        content: `Your LFG post is live in <#${QUEUE_CHANNEL_ID}>.`,
        components: [],
      });

      console.log(`Created LFG post ${sentMessage.id} for user ${interaction.user.tag}`);
      return;
    }

    if (
      interaction.isStringSelectMenu() &&
      interaction.customId === `lfg_rank_${interaction.user.id}`
    ) {
      const selectedRank = interaction.values[0];
      const current = pendingLfg.get(interaction.user.id);

      if (!current || !current.type || !current.region || !current.mode) {
        await interaction.update({
          content: 'Your setup expired. Please run **/lfg** again.',
          components: [],
        });
        return;
      }

      const sentMessage = await createLfgPost(
        interaction,
        current.type,
        current.region,
        current.mode,
        selectedRank
      );

      pendingLfg.delete(interaction.user.id);

      await interaction.update({
        content: `Your LFG post is live in <#${QUEUE_CHANNEL_ID}>.`,
        components: [],
      });

      console.log(`Created LFG post ${sentMessage.id} for user ${interaction.user.tag}`);
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('lfg_join_')) {
      const ownerId = interaction.customId.replace('lfg_join_', '');
      const post = activePosts.get(ownerId);

      if (!post) {
        await interaction.reply({
          content: 'That LFG post is no longer active.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      if (post.isClosed) {
        await interaction.reply({
          content: 'That LFG post is closed.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const maxPlayers = getMaxPlayers(post.type);

      if (post.joinedUserIds.includes(interaction.user.id)) {
        await interaction.reply({
          content: 'You already joined this group.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      if (post.joinedUserIds.length >= maxPlayers) {
        await interaction.reply({
          content: 'That group is already full.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      post.joinedUserIds.push(interaction.user.id);
      await refreshPost(ownerId);

      await interaction.reply({
        content: 'You joined the group.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('lfg_leave_')) {
      const ownerId = interaction.customId.replace('lfg_leave_', '');
      const post = activePosts.get(ownerId);

      if (!post) {
        await interaction.reply({
          content: 'That LFG post is no longer active.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      if (post.isClosed) {
        await interaction.reply({
          content: 'That LFG post is already closed.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      if (!post.joinedUserIds.includes(interaction.user.id)) {
        await interaction.reply({
          content: 'You are not in this group.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      if (interaction.user.id === ownerId) {
        await interaction.reply({
          content: 'Host cannot leave their own group. Use Close instead.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      post.joinedUserIds = post.joinedUserIds.filter((id) => id !== interaction.user.id);
      await refreshPost(ownerId);

      await interaction.reply({
        content: 'You left the group.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('lfg_close_')) {
      const ownerId = interaction.customId.replace('lfg_close_', '');
      const post = activePosts.get(ownerId);

      if (!post) {
        await interaction.reply({
          content: 'That LFG post is already gone.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      if (interaction.user.id !== ownerId) {
        await interaction.reply({
          content: 'Only the host can close this LFG post.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const channel = await client.channels.fetch(post.queueChannelId);
      const msg = await channel.messages.fetch(post.messageId);

      if (DELETE_ON_CLOSE) {
        await msg.delete();
        activePosts.delete(ownerId);

        await interaction.reply({
          content: 'Your LFG post was closed and deleted.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      post.isClosed = true;
      await refreshPost(ownerId);

      await interaction.reply({
        content: 'Your LFG post was marked as closed.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
  } catch (error) {
    console.error('Interaction error:', error);

    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'Something went wrong while handling that command.',
        flags: MessageFlags.Ephemeral,
      });
    }
  }
});

client.login(TOKEN);