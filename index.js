const {
  Client, GatewayIntentBits, SlashCommandBuilder,
  REST, Routes, EmbedBuilder, PermissionFlagsBits,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');

const TOKEN     = process.env.BOT_TOKEN || 'TON_TOKEN_ICI';
const CLIENT_ID = process.env.CLIENT_ID || 'TON_CLIENT_ID_ICI';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildScheduledEvents,
  ],
});

// ── CONFIG EN MÉMOIRE (remplace par une DB en production) ──────────────────
const serverConfigs = new Map();
const gifCounts     = new Map();

function getConfig(guildId) {
  if (!serverConfigs.has(guildId)) {
    serverConfigs.set(guildId, {
      welcome:  { enabled: true,  channelId: null, message: 'Bienvenue {user} !' },
      goodbye:  { enabled: true,  channelId: null, message: 'Au revoir {user} !' },
      gifs:     { tracking: true, topCount: 10 },
      economy:  { enabled: true,  currency: 'Coins', daily: 100, perMessage: 5 },
      jugement: { announceChannelId: null, announceRoleId: null },
    });
  }
  return serverConfigs.get(guildId);
}

// ── COMMANDES SLASH ────────────────────────────────────────────────────────
const commands = [

  new SlashCommandBuilder()
    .setName('config')
    .setDescription('[Admin] Configurer le bot directement depuis Discord')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  new SlashCommandBuilder()
    .setName('topgif')
    .setDescription('Top GIFs les plus utilisés'),

  new SlashCommandBuilder()
    .setName('dailybooster')
    .setDescription('Ouvrir un booster quotidien')
    .addStringOption(o => o.setName('collection').setDescription('Nom de la collection').setRequired(true)),

  new SlashCommandBuilder()
    .setName('index')
    .setDescription('Voir tes cartes dans une collection')
    .addStringOption(o => o.setName('collection').setDescription('Nom de la collection').setRequired(true)),

  new SlashCommandBuilder()
    .setName('givecard')
    .setDescription('[Admin] Donner une carte à un utilisateur')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(o => o.setName('carte').setDescription('Nom de la carte').setRequired(true))
    .addUserOption(o => o.setName('utilisateur').setDescription('Joueur cible').setRequired(true)),

  new SlashCommandBuilder()
    .setName('jugement')
    .setDescription('[Admin] Créer un event de jugement')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addUserOption(o => o.setName('utilisateur').setDescription('Utilisateur jugé').setRequired(true))
    .addStringOption(o => o.setName('raison').setDescription('Raison du jugement').setRequired(true))
    .addChannelOption(o => o.setName('salon').setDescription('Salon de conférence').setRequired(true))
    .addStringOption(o => o.setName('date').setDescription('Date et heure (ex: 12/12/2026 20:00)').setRequired(true)),

  new SlashCommandBuilder()
    .setName('dailymoney')
    .setDescription('Réclamer ton argent quotidien'),

  new SlashCommandBuilder()
    .setName('balance')
    .setDescription('Voir ton solde'),

  new SlashCommandBuilder()
    .setName('shop')
    .setDescription('Voir le shop du serveur'),

  new SlashCommandBuilder()
    .setName('giveaway')
    .setDescription('[Admin] Lancer un giveaway')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(o => o.setName('type').setDescription('Type de récompense').setRequired(true)
      .addChoices(
        { name: 'Booster',         value: 'booster'         },
        { name: 'Argent',          value: 'money'           },
        { name: 'Rôle',            value: 'role'            },
        { name: 'Rôle temporaire', value: 'role_temporaire' },
      ))
    .addStringOption(o => o.setName('recompense').setDescription('Nom de la collection / rôle').setRequired(true))
    .addIntegerOption(o => o.setName('quantite').setDescription('Quantité'))
    .addRoleOption(o => o.setName('role_requis').setDescription('Rôle requis pour participer'))
    .addRoleOption(o => o.setName('role_interdit').setDescription('Rôle interdit de participer'))
    .addStringOption(o => o.setName('duree').setDescription('Durée (ex: 1h, 30m, 1d)').setRequired(true))
    .addIntegerOption(o => o.setName('gagnants').setDescription('Nombre de gagnants').setRequired(true))
    .addChannelOption(o => o.setName('salon').setDescription("Salon d'affichage").setRequired(true)),

].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

client.once('ready', async () => {
  console.log(`✅ Connecté en tant que ${client.user.tag}`);
  await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
  console.log('📝 Commandes enregistrées');
});

// ── PANNEAU /config ────────────────────────────────────────────────────────
function buildConfigPanel(guildId) {
  const cfg = getConfig(guildId);
  const wCh = cfg.welcome.channelId ? '<#' + cfg.welcome.channelId + '>' : 'Non défini';
  const gCh = cfg.goodbye.channelId ? '<#' + cfg.goodbye.channelId + '>' : 'Non défini';

  const embed = new EmbedBuilder()
    .setTitle('⚙️ Configuration du bot')
    .setColor(0x5865F2)
    .addFields(
      { name: '👋 Bienvenue',    value: 'Activé: ' + (cfg.welcome.enabled ? '✅' : '❌') + '\nSalon: ' + wCh + '\nMessage: ' + cfg.welcome.message, inline: true },
      { name: '🚪 Au revoir',    value: 'Activé: ' + (cfg.goodbye.enabled ? '✅' : '❌') + '\nSalon: ' + gCh + '\nMessage: ' + cfg.goodbye.message, inline: true },
      { name: '\u200B', value: '\u200B', inline: false },
      { name: '🎞️ GIF Tracking', value: 'Activé: ' + (cfg.gifs.tracking ? '✅' : '❌') + '\nTop affiché: ' + cfg.gifs.topCount, inline: true },
      { name: '🪙 Économie',     value: 'Activé: ' + (cfg.economy.enabled ? '✅' : '❌') + '\nMonnaie: ' + cfg.economy.currency + '\nGain/msg: ' + cfg.economy.perMessage + '\nDaily: ' + cfg.economy.daily, inline: true },
    )
    .setFooter({ text: 'Clique sur un bouton pour modifier une section' })
    .setTimestamp();

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('cfg_welcome').setLabel('👋 Bienvenue').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('cfg_goodbye').setLabel('🚪 Au revoir').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('cfg_gifs').setLabel('🎞️ GIFs').setStyle(ButtonStyle.Secondary),
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('cfg_economy').setLabel('🪙 Économie').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('cfg_jugement').setLabel('⚖️ Jugement').setStyle(ButtonStyle.Secondary),
  );

  return { embeds: [embed], components: [row1, row2], ephemeral: true };
}

// ── MESSAGES (GIFs) ────────────────────────────────────────────────────────
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;
  const sid = message.guild.id;
  const cfg = getConfig(sid);

  if (cfg.gifs.tracking) {
    const gifRegex = /https?:\/\/[^\s]+\.gif(\?[^\s]*)?|https?:\/\/tenor\.com\/view\/[^\s]+|https?:\/\/media\.tenor\.com\/[^\s]+|https?:\/\/media[0-9]?\.giphy\.com\/[^\s]+/gi;
    const gifs = [...(message.content.match(gifRegex) || [])];
    message.embeds?.forEach(e => { if (e.type === 'gifv' && e.url) gifs.push(e.url); });
    if (!gifCounts.has(sid)) gifCounts.set(sid, new Map());
    gifs.forEach(url => {
      const m = gifCounts.get(sid);
      const ex = m.get(url) || { count: 0 };
      m.set(url, { count: ex.count + 1, lastUser: message.author.username });
    });
  }
});

// ── BIENVENUE / AU REVOIR ──────────────────────────────────────────────────
client.on('guildMemberAdd', async (member) => {
  const cfg = getConfig(member.guild.id);
  if (!cfg.welcome.enabled || !cfg.welcome.channelId) return;
  const ch = member.guild.channels.cache.get(cfg.welcome.channelId);
  if (ch) ch.send(cfg.welcome.message.replace('{user}', '<@' + member.id + '>'));
});

client.on('guildMemberRemove', async (member) => {
  const cfg = getConfig(member.guild.id);
  if (!cfg.goodbye.enabled || !cfg.goodbye.channelId) return;
  const ch = member.guild.channels.cache.get(cfg.goodbye.channelId);
  if (ch) ch.send(cfg.goodbye.message.replace('{user}', member.user.username));
});

// ── INTERACTIONS ───────────────────────────────────────────────────────────
client.on('interactionCreate', async (interaction) => {
  const { guild } = interaction;

  // ── COMMANDES SLASH ──
  if (interaction.isChatInputCommand()) {
    const { commandName } = interaction;

    if (commandName === 'config') {
      return interaction.reply(buildConfigPanel(guild.id));
    }

    if (commandName === 'topgif') {
      const serverGifs = gifCounts.get(guild.id);
      const cfg = getConfig(guild.id);
      if (!serverGifs || serverGifs.size === 0)
        return interaction.reply({ content: 'Aucun GIF enregistré !', ephemeral: true });
      const sorted = [...serverGifs.entries()].sort(([, a], [, b]) => b.count - a.count).slice(0, cfg.gifs.topCount);
      const medals = ['🥇', '🥈', '🥉'];
      const desc = sorted.map(([url, d], i) =>
        (i < 3 ? medals[i] : '**' + (i + 1) + '.**') + ' [GIF](' + url + ') — **' + d.count + '** fois _(dernier: ' + d.lastUser + ')_'
      ).join('\n');
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🏆 Top GIFs').setDescription(desc).setColor(0x5865F2).setTimestamp()] });
    }

    if (commandName === 'jugement') {
      const target  = interaction.options.getUser('utilisateur');
      const raison  = interaction.options.getString('raison');
      const salon   = interaction.options.getChannel('salon');
      const dateStr = interaction.options.getString('date');
      const [datePart, timePart = '20:00'] = dateStr.split(' ');
      const [day, month, year] = datePart.split('/');
      const [hour, minute]     = timePart.split(':');
      const eventDate = new Date(year + '-' + month + '-' + day + 'T' + hour + ':' + minute + ':00');
      await guild.scheduledEvents.create({
        name: 'Jugement de ' + target.username,
        scheduledStartTime: eventDate,
        scheduledEndTime: new Date(eventDate.getTime() + 2 * 60 * 60 * 1000),
        privacyLevel: 2, entityType: 2, channel: salon, description: raison,
      }).catch(console.error);
      return interaction.reply({ content: '⚖️ Jugement de **' + target.username + '** le ' + dateStr + ' — ' + raison });
    }

    if (commandName === 'dailybooster') {
      const col = interaction.options.getString('collection');
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🎴 Booster — ' + col).setDescription('3 cartes obtenues ! Reviens demain.').setColor(0x9B59B6)] });
    }

    if (commandName === 'index') {
      const col = interaction.options.getString('collection');
      return interaction.reply({ content: '📖 Collection **' + col + '** chargée.', ephemeral: true });
    }

    if (commandName === 'givecard') {
      const cardName = interaction.options.getString('carte');
      const target   = interaction.options.getUser('utilisateur');
      return interaction.reply({ content: '✅ **' + cardName + '** donnée à ' + target.username + ' !' });
    }

    if (commandName === 'dailymoney')
      return interaction.reply({ content: '🪙 Argent quotidien réclamé !', ephemeral: true });

    if (commandName === 'balance')
      return interaction.reply({ content: '💰 Ton solde : 0 Coins', ephemeral: true });

    if (commandName === 'shop')
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🛒 Shop').setDescription('Aucun article disponible.').setColor(0x5865F2)], ephemeral: true });

    if (commandName === 'giveaway') {
      const type         = interaction.options.getString('type');
      const recompense   = interaction.options.getString('recompense');
      const quantite     = interaction.options.getInteger('quantite') || 1;
      const roleRequis   = interaction.options.getRole('role_requis');
      const roleInterdit = interaction.options.getRole('role_interdit');
      const duree        = interaction.options.getString('duree');
      const gagnants     = interaction.options.getInteger('gagnants');
      const salonCible   = interaction.options.getChannel('salon');
      const labels = { booster: 'Booster', money: 'Argent', role: 'Rôle', role_temporaire: 'Rôle temporaire' };
      const embed = new EmbedBuilder()
        .setTitle('🎉 Nouveau Giveaway !')
        .addFields(
          { name: '🎁 Récompense',    value: labels[type] + ' : **' + recompense + (quantite > 1 ? ' x' + quantite : '') + '**', inline: true },
          { name: '🏆 Gagnants',      value: '' + gagnants, inline: true },
          { name: '⏱ Durée',          value: duree, inline: true },
          { name: '✅ Rôle requis',    value: roleRequis   ? roleRequis.toString()   : 'Aucun', inline: true },
          { name: '🚫 Rôle interdit',  value: roleInterdit ? roleInterdit.toString() : 'Aucun', inline: true },
        )
        .setColor(0xFF73FA).setFooter({ text: 'Réagis avec 🎉 pour participer !' }).setTimestamp();
      const msg = await salonCible.send({ embeds: [embed] });
      await msg.react('🎉');
      return interaction.reply({ content: '✅ Giveaway lancé dans ' + salonCible + ' !', ephemeral: true });
    }
  }

  // ── BOUTONS (config) ──
  if (interaction.isButton()) {
    const cfg = getConfig(guild.id);
    const modalDefs = {
      cfg_welcome: {
        id: 'modal_welcome', title: '⚙️ Config Bienvenue',
        fields: [
          { id: 'welcome_enabled', label: 'Activé ? (oui/non)',        value: cfg.welcome.enabled ? 'oui' : 'non' },
          { id: 'welcome_channel', label: 'ID du salon (ou vide)',      value: cfg.welcome.channelId || '',        req: false },
          { id: 'welcome_message', label: 'Message ({user} = mention)', value: cfg.welcome.message,               para: true },
        ],
      },
      cfg_goodbye: {
        id: 'modal_goodbye', title: '⚙️ Config Au revoir',
        fields: [
          { id: 'goodbye_enabled', label: 'Activé ? (oui/non)',    value: cfg.goodbye.enabled ? 'oui' : 'non' },
          { id: 'goodbye_channel', label: 'ID du salon (ou vide)', value: cfg.goodbye.channelId || '',        req: false },
          { id: 'goodbye_message', label: 'Message ({user} = nom)', value: cfg.goodbye.message,               para: true },
        ],
      },
      cfg_gifs: {
        id: 'modal_gifs', title: '⚙️ Config GIF Tracking',
        fields: [
          { id: 'gifs_tracking', label: 'Tracking activé ? (oui/non)', value: cfg.gifs.tracking ? 'oui' : 'non' },
          { id: 'gifs_topcount', label: 'Nb de GIFs dans /topgif',     value: '' + cfg.gifs.topCount },
        ],
      },
      cfg_economy: {
        id: 'modal_economy', title: '⚙️ Config Économie',
        fields: [
          { id: 'eco_enabled',  label: 'Activé ? (oui/non)', value: cfg.economy.enabled ? 'oui' : 'non' },
          { id: 'eco_currency', label: 'Nom de la monnaie',  value: cfg.economy.currency },
          { id: 'eco_daily',    label: 'Gain quotidien',     value: '' + cfg.economy.daily },
          { id: 'eco_permsg',   label: 'Gain par message',   value: '' + cfg.economy.perMessage },
        ],
      },
      cfg_jugement: {
        id: 'modal_jugement', title: '⚙️ Config Jugement',
        fields: [
          { id: 'jug_channel', label: 'ID salon annonce (ou vide)',     value: cfg.jugement.announceChannelId || '', req: false },
          { id: 'jug_role',    label: 'ID rôle à mentionner (ou vide)', value: cfg.jugement.announceRoleId    || '', req: false },
        ],
      },
    };
    const def = modalDefs[interaction.customId];
    if (!def) return;
    const modal = new ModalBuilder().setCustomId(def.id).setTitle(def.title);
    modal.addComponents(...def.fields.map(f =>
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(f.id).setLabel(f.label)
          .setStyle(f.para ? TextInputStyle.Paragraph : TextInputStyle.Short)
          .setValue(f.value).setRequired(f.req !== false)
      )
    ));
    return interaction.showModal(modal);
  }

  // ── MODALES ──
  if (interaction.isModalSubmit()) {
    const cfg = getConfig(guild.id);
    const v    = (id) => interaction.fields.getTextInputValue(id);
    const bool = (id) => v(id).toLowerCase() === 'oui';
    if      (interaction.customId === 'modal_welcome')  { cfg.welcome.enabled = bool('welcome_enabled'); cfg.welcome.channelId = v('welcome_channel') || null; cfg.welcome.message = v('welcome_message'); }
    else if (interaction.customId === 'modal_goodbye')  { cfg.goodbye.enabled = bool('goodbye_enabled'); cfg.goodbye.channelId = v('goodbye_channel') || null; cfg.goodbye.message = v('goodbye_message'); }
    else if (interaction.customId === 'modal_gifs')     { cfg.gifs.tracking = bool('gifs_tracking'); cfg.gifs.topCount = parseInt(v('gifs_topcount')) || 10; }
    else if (interaction.customId === 'modal_economy')  { cfg.economy.enabled = bool('eco_enabled'); cfg.economy.currency = v('eco_currency'); cfg.economy.daily = parseInt(v('eco_daily')) || 100; cfg.economy.perMessage = parseInt(v('eco_permsg')) || 5; }
    else if (interaction.customId === 'modal_jugement') { cfg.jugement.announceChannelId = v('jug_channel') || null; cfg.jugement.announceRoleId = v('jug_role') || null; }
    return interaction.reply({ content: '✅ Configuration sauvegardée !', ephemeral: true });
  }
});

client.login(TOKEN);
