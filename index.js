const {
  Client, GatewayIntentBits, SlashCommandBuilder,
  REST, Routes, EmbedBuilder, PermissionFlagsBits
} = require('discord.js');

const TOKEN = 'ton_token_discord';
const CLIENT_ID = 'id_de_ton_bot';
const DASHBOARD_URL = 'https://simezath-bot.base44.app';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildScheduledEvents,
  ],
});

const gifCounts = new Map();

const commands = [
  new SlashCommandBuilder().setName('topgif').setDescription('Top 10 des GIFs les plus utilisés'),
  new SlashCommandBuilder().setName('dailybooster').setDescription('Ouvrir un booster quotidien de 3 cartes')
    .addStringOption(o => o.setName('collection').setDescription('Nom de la collection').setRequired(true)),
  new SlashCommandBuilder().setName('index').setDescription('Voir tes cartes dans une collection')
    .addStringOption(o => o.setName('collection').setDescription('Nom de la collection').setRequired(true)),
  new SlashCommandBuilder().setName('givecard').setDescription('[Admin] Donner une carte')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(o => o.setName('carte').setDescription('Nom de la carte').setRequired(true))
    .addUserOption(o => o.setName('utilisateur').setDescription('Joueur cible').setRequired(true)),
  new SlashCommandBuilder().setName('jugement').setDescription('[Admin] Créer un event de jugement')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addUserOption(o => o.setName('utilisateur').setDescription('Utilisateur jugé').setRequired(true))
    .addStringOption(o => o.setName('raison').setDescription('Raison').setRequired(true))
    .addChannelOption(o => o.setName('salon').setDescription('Salon de conférence').setRequired(true))
    .addStringOption(o => o.setName('date').setDescription('Date ex: 12/12/2026').setRequired(true)),
  new SlashCommandBuilder().setName('dailymoney').setDescription('Réclamer ton argent quotidien'),
  new SlashCommandBuilder().setName('balance').setDescription('Voir ton solde'),
  new SlashCommandBuilder().setName('shop').setDescription('Voir le shop du serveur'),
  new SlashCommandBuilder().setName('giveaway').setDescription('[Admin] Lancer un giveaway')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(o => o.setName('type').setDescription('Type de récompense').setRequired(true)
      .addChoices(
        { name: 'Booster', value: 'booster' },
        { name: 'Argent', value: 'money' },
        { name: 'Role', value: 'role' },
        { name: 'Role temporaire', value: 'role_temporaire' }
      ))
    .addStringOption(o => o.setName('recompense').setDescription('Nom collection / role').setRequired(true))
    .addStringOption(o => o.setName('duree').setDescription('Duree ex: 1h, 30m, 1d').setRequired(true))
    .addIntegerOption(o => o.setName('gagnants').setDescription('Nombre de gagnants').setRequired(true))
    .addChannelOption(o => o.setName('salon').setDescription("Salon d'affichage").setRequired(true))
    .addIntegerOption(o => o.setName('quantite').setDescription('Quantite'))
    .addRoleOption(o => o.setName('role_requis').setDescription('Role requis'))
    .addRoleOption(o => o.setName('role_interdit').setDescription('Role interdit')),
].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

client.once('ready', async () => {
  console.log('Connecte en tant que ' + client.user.tag);
  await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
  console.log('Commandes slash enregistrees');
});

client.on('messageCreate', (message) => {
  if (message.author.bot || !message.guild) return;
  const sid = message.guild.id;
  const gifRegex = /https?:\/\/[^\s]+\.gif(\?[^\s]*)?|https?:\/\/tenor\.com\/view\/[^\s]+|https?:\/\/media\.tenor\.com\/[^\s]+|https?:\/\/media[0-9]?\.giphy\.com\/[^\s]+/gi;
  const gifs = message.content.match(gifRegex) || [];
  if (!gifCounts.has(sid)) gifCounts.set(sid, new Map());
  gifs.forEach(url => {
    const m = gifCounts.get(sid);
    const ex = m.get(url) || { count: 0 };
    m.set(url, { count: ex.count + 1, lastUser: message.author.username });
  });
});

client.on('guildMemberAdd', (member) => {
  console.log(member.user.username + ' a rejoint ' + member.guild.name);
});

client.on('guildMemberRemove', (member) => {
  console.log(member.user.username + ' a quitte ' + member.guild.name);
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName, guild } = interaction;

  if (commandName === 'topgif') {
    const serverGifs = gifCounts.get(guild.id);
    if (!serverGifs || serverGifs.size === 0) {
      return interaction.reply({ content: "Aucun GIF enregistre pour le moment !", ephemeral: true });
    }
    const sorted = [...serverGifs.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 10);
    const medals = ['1er', '2eme', '3eme'];
    const lines = sorted.map((entry, i) => {
      const rank = i < 3 ? medals[i] : (i + 1) + '.';
      return rank + ' [GIF](' + entry[0] + ') - ' + entry[1].count + ' utilisations (dernier: ' + entry[1].lastUser + ')';
    });
    const embed = new EmbedBuilder()
      .setTitle('Top GIFs du serveur')
      .setDescription(lines.join('\n'))
      .setColor(0x5865F2)
      .setTimestamp();
    return interaction.reply({ embeds: [embed] });
  }

  if (commandName === 'dailybooster') {
    const col = interaction.options.getString('collection');
    const embed = new EmbedBuilder()
      .setTitle('Booster quotidien - ' + col)
      .setDescription('3 cartes obtenues ! Va sur le dashboard pour les voir : ' + DASHBOARD_URL)
      .setColor(0x9B59B6);
    return interaction.reply({ embeds: [embed] });
  }

  if (commandName === 'index') {
    const col = interaction.options.getString('collection');
    const embed = new EmbedBuilder()
      .setTitle('Index - ' + col)
      .setDescription('Voir ta collection ici : ' + DASHBOARD_URL + '/card-index?serverId=' + guild.id + '&userId=' + interaction.user.id)
      .setColor(0x5865F2);
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  if (commandName === 'givecard') {
    const cardName = interaction.options.getString('carte');
    const target = interaction.options.getUser('utilisateur');
    return interaction.reply({ content: 'La carte ' + cardName + ' a ete donnee a ' + target.username + ' !' });
  }

  if (commandName === 'jugement') {
    const target = interaction.options.getUser('utilisateur');
    const raison = interaction.options.getString('raison');
    const salon = interaction.options.getChannel('salon');
    const date = interaction.options.getString('date');
    const parts = date.split('/');
    const eventDate = new Date(parts[2] + '-' + parts[1] + '-' + parts[0] + 'T20:00:00');
    await guild.scheduledEvents.create({
      name: 'Jugement de ' + target.username,
      scheduledStartTime: eventDate,
      scheduledEndTime: new Date(eventDate.getTime() + 2 * 60 * 60 * 1000),
      privacyLevel: 2,
      entityType: 2,
      channel: salon,
      description: raison,
    }).catch(console.error);
    return interaction.reply({ content: 'Event cree : Jugement de ' + target.username + ' le ' + date });
  }

  if (commandName === 'dailymoney') {
    return interaction.reply({ content: 'Tu as reclame ton argent quotidien !', ephemeral: true });
  }

  if (commandName === 'balance') {
    return interaction.reply({ content: 'Ton solde : 0 Coins', ephemeral: true });
  }

  if (commandName === 'shop') {
    const embed = new EmbedBuilder().setTitle('Shop du serveur').setDescription('Aucun article pour le moment.').setColor(0x5865F2);
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  if (commandName === 'giveaway') {
    const type = interaction.options.getString('type');
    const recompense = interaction.options.getString('recompense');
    const quantite = interaction.options.getInteger('quantite') || 1;
    const roleRequis = interaction.options.getRole('role_requis');
    const roleInterdit = interaction.options.getRole('role_interdit');
    const duree = interaction.options.getString('duree');
    const gagnants = interaction.options.getInteger('gagnants');
    const salonCible = interaction.options.getChannel('salon');
    const embed = new EmbedBuilder()
      .setTitle('Nouveau Giveaway !')
      .addFields(
        { name: 'Recompense', value: type + ' : ' + recompense + (quantite > 1 ? ' x' + quantite : ''), inline: true },
        { name: 'Gagnants', value: '' + gagnants, inline: true },
        { name: 'Duree', value: duree, inline: true },
        { name: 'Role requis', value: roleRequis ? roleRequis.toString() : 'Aucun', inline: true },
        { name: 'Role interdit', value: roleInterdit ? roleInterdit.toString() : 'Aucun', inline: true }
      )
      .setColor(0xFF73FA)
      .setTimestamp();
    const msg = await salonCible.send({ embeds: [embed] });
    await msg.react('🎉');
    return interaction.reply({ content: 'Giveaway lance dans ' + salonCible.name + ' !', ephemeral: true });
  }
});

client.login(TOKEN);
