const {
  Client, GatewayIntentBits, SlashCommandBuilder,
  REST, Routes, EmbedBuilder, PermissionFlagsBits
} = require('discord.js');

const TOKEN = process.env.BOT_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const DASHBOARD_URL = process.env.DASHBOARD_URL;
const BASE44_API_KEY = process.env.BASE44_API_KEY;
const BASE44_APP_ID = process.env.BASE44_APP_ID;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildScheduledEvents,
  ],
});

// ── GIF TRACKING ──────────────────────────────────────
const gifCounts = new Map();

// ── SLASH COMMANDS ────────────────────────────────────
const commands = [
  new SlashCommandBuilder()
    .setName('topgif')
    .setDescription('Top 10 des GIFs les plus utilisés'),

  new SlashCommandBuilder()
    .setName('givecard')
    .setDescription('[Admin] Donner une carte à un utilisateur')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(o => o.setName('carte').setDescription('Nom de la carte').setRequired(true))
    .addUserOption(o => o.setName('utilisateur').setDescription('Joueur cible').setRequired(true)),

  new SlashCommandBuilder()
    .setName('dailybooster')
    .setDescription('Ouvrir un booster quotidien de 3 cartes')
    .addStringOption(o => o.setName('collection').setDescription('Nom de la collection').setRequired(true)),

  new SlashCommandBuilder()
    .setName('index')
    .setDescription('Voir tes cartes dans une collection')
    .addStringOption(o => o.setName('collection').setDescription('Nom de la collection').setRequired(true)),

  new SlashCommandBuilder()
    .setName('jugement')
    .setDescription('[Admin] Créer un event de jugement')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addUserOption(o => o.setName('utilisateur').setDescription('Utilisateur jugé').setRequired(true))
    .addStringOption(o => o.setName('raison').setDescription('Raison du jugement').setRequired(true))
    .addChannelOption(o => o.setName('salon').setDescription('Salon de conférence').setRequired(true))
    .addStringOption(o => o.setName('date').setDescription('Date (ex: 12/12/2026)').setRequired(true)),

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
        { name: 'Booster', value: 'booster' },
        { name: 'Argent', value: 'money' },
        { name: 'Rôle', value: 'role' },
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

// ── ENREGISTREMENT SERVEUR SUR BASE44 ─────────────────
async function registerServer(guild) {
  if (!BASE44_API_KEY || !BASE44_APP_ID) return;
  try {
    await fetch(`https://api.base44.com/api/apps/${BASE44_APP_ID}/entities/Server`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': BASE44_API_KEY,
      },
      body: JSON.stringify({
        server_id: guild.id,
        server_name: guild.name,
        server_icon: guild.iconURL() || '',
        bot_enabled: true,
      }),
    });
    console.log(`✅ Serveur enregistré sur le dashboard: ${guild.name}`);
  } catch (e) {
    console.error(`❌ Erreur enregistrement serveur ${guild.name}:`, e.message);
  }
}

// ── READY ─────────────────────────────────────────────
client.once('ready', async () => {
  console.log(`✅ Connecté en tant que ${client.user.tag}`);
  await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
  console.log('📝 Commandes slash enregistrées');

  // Enregistre tous les serveurs déjà présents
  for (const guild of client.guilds.cache.values()) {
    await registerServer(guild);
  }
});

// Quand le bot rejoint un nouveau serveur
client.on('guildCreate', async (guild) => {
  await registerServer(guild);
});

// ── MESSAGE HANDLER (GIFs) ────────────────────────────
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;
  const sid = message.guild.id;

  const gifRegex = /https?:\/\/[^\s]+\.gif(\?[^\s]*)?|https?:\/\/tenor\.com\/view\/[^\s]+|https?:\/\/media\.tenor\.com\/[^\s]+|https?:\/\/media[0-9]?\.giphy\.com\/[^\s]+/gi;
  const gifs = [...(message.content.match(gifRegex) || [])];
  message.embeds?.forEach(e => { if (e.type === 'gifv' && e.url) gifs.push(e.url); });
  if (!gifCounts.has(sid)) gifCounts.set(sid, new Map());
  gifs.forEach(url => {
    const m = gifCounts.get(sid);
    const ex = m.get(url) || { count: 0 };
    m.set(url, { count: ex.count + 1, lastUser: message.author.username });
  });
});

// ── MEMBER JOIN / LEAVE ───────────────────────────────
client.on('guildMemberAdd', async (member) => {
  console.log(`[Welcome] ${member.user.username} a rejoint ${member.guild.name}`);
});

client.on('guildMemberRemove', async (member) => {
  console.log(`[Goodbye] ${member.user.username} a quitté ${member.guild.name}`);
});

// ── INTERACTION HANDLER ───────────────────────────────
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName, guild } = interaction;

  // ── /topgif ──
  if (commandName === 'topgif') {
    const serverGifs = gifCounts.get(guild.id);
    if (!serverGifs || serverGifs.size === 0) {
      return interaction.reply({ content: "Aucun GIF enregistré pour le moment !", ephemeral: true });
    }
    const sorted = [...serverGifs.entries()].sort(([, a], [, b]) => b.count - a.count).slice(0, 10);
    const medals = ['🥇', '🥈', '🥉'];
    const desc = sorted.map(([url, d], i) =>
      `${i < 3 ? medals[i] : `**${i + 1}.**`} [GIF](${url}) — **${d.count}** utilisations _(dernier: ${d.lastUser})_`
    ).join('\n');
    const embed = new EmbedBuilder()
      .setTitle('🏆 Top GIFs du serveur')
      .setDescription(desc)
      .setColor(0x5865F2)
      .setFooter({ text: 'Simezath Bot' })
      .setTimestamp();
    if (sorted[0]) embed.setThumbnail(sorted[0][0]);
    return interaction.reply({ embeds: [embed] });
  }

  // ── /dailybooster ──
  if (commandName === 'dailybooster') {
    const collectionName = interaction.options.getString('collection');
    const embed = new EmbedBuilder()
      .setTitle(`🎴 Booster quotidien — ${collectionName}`)
      .setDescription(
        "**3 cartes obtenues !**\nVa sur le dashboard pour les voir en détail :\n" +
        `[${DASHBOARD_URL}](${DASHBOARD_URL})`
      )
      .setColor(0x9B59B6)
      .setFooter({ text: 'Reviens demain pour un nouveau booster !' });
    return interaction.reply({ embeds: [embed] });
  }

  // ── /index ──
  if (commandName === 'index') {
    const collectionName = interaction.options.getString('collection');
    const userId = interaction.user.id;
    const embed = new EmbedBuilder()
      .setTitle(`📖 Index — ${collectionName}`)
      .setDescription(
        `Voici le lien pour voir ta collection :\n` +
        `[${DASHBOARD_URL}/card-index?serverId=${guild.id}&userId=${userId}](${DASHBOARD_URL})`
      )
      .setColor(0x5865F2);
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // ── /givecard ──
  if (commandName === 'givecard') {
    const cardName = interaction.options.getString('carte');
    const target = interaction.options.getUser('utilisateur');
    return interaction.reply({ content: `✅ La carte **${cardName}** a été donnée à ${target.username} !` });
  }

  // ── /jugement ──
  if (commandName === 'jugement') {
    const target = interaction.options.getUser('utilisateur');
    const raison = interaction.options.getString('raison');
    const salon = interaction.options.getChannel('salon');
    const date = interaction.options.getString('date');

    const [day, month, year] = date.split('/');
    const eventDate = new Date(`${year}-${month}-${day}T20:00:00`);

    await guild.scheduledEvents.create({
      name: `Jugement de ${target.username}`,
      scheduledStartTime: eventDate,
      scheduledEndTime: new Date(eventDate.getTime() + 2 * 60 * 60 * 1000),
      privacyLevel: 2,
      entityType: 2,
      channel: salon,
      description: raison,
    }).catch(console.error);

    return interaction.reply({
      content: `⚖️ Event créé : **Jugement de ${target.username}** le ${date} — Raison : ${raison}`,
      ephemeral: false,
    });
  }

  // ── /dailymoney ──
  if (commandName === 'dailymoney') {
    return interaction.reply({ content: `🪙 Tu as réclamé ton argent quotidien !`, ephemeral: true });
  }

  // ── /balance ──
  if (commandName === 'balance') {
    return interaction.reply({ content: `💰 Ton solde : 0 Coins`, ephemeral: true });
  }

  // ── /shop ──
  if (commandName === 'shop') {
    const embed = new EmbedBuilder()
      .setTitle('🛒 Shop du serveur')
      .setDescription('Aucun article disponible pour le moment.')
      .setColor(0x5865F2)
      .setFooter({ text: 'Ce message disparaît dans 60s' });
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // ── /giveaway ──
  if (commandName === 'giveaway') {
    const type = interaction.options.getString('type');
    const recompense = interaction.options.getString('recompense');
    const quantite = interaction.options.getInteger('quantite') || 1;
    const roleRequis = interaction.options.getRole('role_requis');
    const roleInterdit = interaction.options.getRole('role_interdit');
    const duree = interaction.options.getString('duree');
    const gagnants = interaction.options.getInteger('gagnants');
    const salonCible = interaction.options.getChannel('salon');

    const typeLabels = { booster: 'Booster', money: 'Argent', role: 'Rôle', role_temporaire: 'Rôle temporaire' };
    const embed = new EmbedBuilder()
      .setTitle('🎉 Nouveau Giveaway !')
      .addFields(
        { name: '🎁 Récompense', value: `${typeLabels[type]} : **${recompense}**` + (quantite > 1 ? ` x${quantite}` : ''), inline: true },
        { name: '🏆 Gagnants', value: `${gagnants}`, inline: true },
        { name: '⏱ Durée', value: duree, inline: true },
        { name: '✅ Rôle requis', value: roleRequis ? roleRequis.toString() : 'Aucun', inline: true },
        { name: '🚫 Rôle interdit', value: roleInterdit ? roleInterdit.toString() : 'Aucun', inline: true },
      )
      .setColor(0xFF73FA)
      .setFooter({ text: 'Réagis avec 🎉 pour participer !' })
      .setTimestamp();

    const msg = await salonCible.send({ embeds: [embed] });
    await msg.react('🎉');

    return interaction.reply({ content: `✅ Giveaway lancé dans ${salonCible} !`, ephemeral: true });
  }
});

client.login(TOKEN);
