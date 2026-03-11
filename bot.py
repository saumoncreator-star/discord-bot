"""
Simezath Bot - Discord Card Collection Bot
pip install discord.py aiohttp python-dotenv
"""

import discord
from discord import app_commands
from discord.ext import commands
import aiohttp
import os
import random
import json
from dotenv import load_dotenv

load_dotenv()

DISCORD_TOKEN = os.getenv("DISCORD_TOKEN")
BASE44_API_KEY = os.getenv("BASE44_API_KEY")
BASE44_APP_ID = os.getenv("BASE44_APP_ID")

CARDS_PER_BOOSTER = 3

RARITY_COLORS = {
    "Nul": 0x9CA3AF, "Commun": 0xD1D5DB, "Uncommun": 0x22C55E,
    "Rare": 0x3B82F6, "Epic": 0xA855F7, "Legendaire": 0xF59E0B,
    "Mythique": 0xEF4444, "Sigma": 0xEC4899, "Exclusif": 0xFFD700,
}

RARITY_EMOJIS = {
    "Nul": "⚫", "Commun": "⚪", "Uncommun": "🟢", "Rare": "🔵",
    "Epic": "🟣", "Legendaire": "🟡", "Mythique": "🔴", "Sigma": "💗", "Exclusif": "⭐",
}

RARITY_ORDER = ["Exclusif", "Sigma", "Mythique", "Legendaire", "Epic", "Rare", "Uncommun", "Commun", "Nul"]


class Base44Client:
    def __init__(self, api_key: str, app_id: str):
        self.base_url = f"https://api.base44.com/api/apps/{app_id}/entities"
        self.headers = {"api-key": api_key, "Content-Type": "application/json"}

    async def list(self, entity: str, filters: dict = None, limit: int = 200):
        params = {"limit": limit}
        if filters:
            params["filter"] = json.dumps(filters)
        async with aiohttp.ClientSession() as s:
            async with s.get(f"{self.base_url}/{entity}", headers=self.headers, params=params) as r:
                data = await r.json()
                return data if isinstance(data, list) else data.get("data", [])

    async def create(self, entity: str, data: dict):
        async with aiohttp.ClientSession() as s:
            async with s.post(f"{self.base_url}/{entity}", headers=self.headers, json=data) as r:
                return await r.json()

    async def update(self, entity: str, entity_id: str, data: dict):
        async with aiohttp.ClientSession() as s:
            async with s.patch(f"{self.base_url}/{entity}/{entity_id}", headers=self.headers, json=data) as r:
                return await r.json()

    async def delete(self, entity: str, entity_id: str):
        async with aiohttp.ClientSession() as s:
            async with s.delete(f"{self.base_url}/{entity}/{entity_id}", headers=self.headers) as r:
                return await r.json()


intents = discord.Intents.default()
intents.guilds = True
bot = commands.Bot(command_prefix="!", intents=intents)
api = Base44Client(BASE44_API_KEY, BASE44_APP_ID)


# ─── EVENTS ────────────────────────────────────────────────────────────────────

@bot.event
async def on_ready():
    print(f"✅ {bot.user} connecté!")
    synced = await bot.tree.sync()
    print(f"✅ {len(synced)} commandes synchronisées")


@bot.event
async def on_guild_join(guild: discord.Guild):
    """Enregistre automatiquement le serveur sur le site."""
    existing = await api.list("Server", filters={"discord_server_id": str(guild.id)})
    if not existing:
        await api.create("Server", {
            "discord_server_id": str(guild.id),
            "name": guild.name,
            "icon_url": str(guild.icon.url) if guild.icon else None,
            "owner_email": f"discord:{guild.owner_id}@discord.com",
            "member_count": guild.member_count,
            "is_active": True,
        })
        print(f"✅ Serveur '{guild.name}' enregistré!")
        for channel in guild.text_channels:
            if channel.permissions_for(guild.me).send_messages:
                embed = discord.Embed(
                    title="🎴 Simezath Bot est arrivé!",
                    description="Utilisez `/aide` pour voir toutes les commandes.",
                    color=0x8B5CF6
                )
                await channel.send(embed=embed)
                break


@bot.event
async def on_guild_update(before: discord.Guild, after: discord.Guild):
    """Met à jour le nom/icône du serveur sur le site si changés."""
    if before.name != after.name or before.icon != after.icon:
        servers = await api.list("Server", filters={"discord_server_id": str(after.id)})
        if servers:
            await api.update("Server", servers[0]["id"], {
                "name": after.name,
                "icon_url": str(after.icon.url) if after.icon else None,
                "member_count": after.member_count,
            })


# ─── HELPERS ───────────────────────────────────────────────────────────────────

async def get_server(guild_id: str):
    servers = await api.list("Server", filters={"discord_server_id": guild_id})
    return servers[0] if servers else None


def weighted_choice(cards: list, count: int) -> list:
    if not cards:
        return []
    weights = [c.get("drop_weight") or 100 for c in cards]
    return random.choices(cards, weights=weights, k=count)


def card_embed(card: dict) -> discord.Embed:
    rarity = card.get("rarity", "Commun")
    embed = discord.Embed(
        title=f"{RARITY_EMOJIS.get(rarity, '')} {card['name']}",
        description=card.get("description", ""),
        color=RARITY_COLORS.get(rarity, 0x8B5CF6),
    )
    embed.add_field(name="Rareté", value=f"{RARITY_EMOJIS.get(rarity, '')} {rarity}", inline=True)
    embed.add_field(name="Disponible", value="✅" if card.get("is_available") else "❌", inline=True)
    if card.get("image_url"):
        embed.set_image(url=card["image_url"])
    return embed


async def add_card_to_player(discord_id: str, card: dict, server_id: str, obtained_via: str = "booster") -> bool:
    """Ajoute une carte à l'inventaire, incrémente si doublon. Retourne True si nouvelle."""
    player_email = f"discord:{discord_id}@discord.com"
    existing = await api.list("PlayerCard", filters={
        "player_discord_id": discord_id,
        "card_id": card["id"],
        "server_id": server_id,
    })
    if existing:
        pc = existing[0]
        await api.update("PlayerCard", pc["id"], {"quantity": (pc.get("quantity") or 1) + 1})
        return False
    await api.create("PlayerCard", {
        "player_email": player_email,
        "player_discord_id": discord_id,
        "card_id": card["id"],
        "server_id": server_id,
        "collection_id": card.get("collection_id"),
        "quantity": 1,
        "obtained_via": obtained_via,
    })
    return True


# ─── SLASH COMMANDS ─────────────────────────────────────────────────────────────

@bot.tree.command(name="aide", description="Affiche toutes les commandes disponibles")
async def aide(interaction: discord.Interaction):
    embed = discord.Embed(title="🎴 Commandes Simezath Bot", color=0x8B5CF6)
    embed.add_field(name="🃏 Cartes",
        value="`/carte <nom>` – Voir une carte
`/collection <nom>` – Voir les cartes d'une collection
`/collections` – Lister toutes les collections", inline=False)
    embed.add_field(name="🎒 Inventaire",
        value="`/inventaire` – Voir tes cartes et boosters
`/ouvrir_booster <collection>` – Ouvrir un booster (3 cartes!)", inline=False)
    embed.add_field(name="🔧 Admin",
        value="`/donner_booster @user collection [quantité]` – Donner un booster
`/donner_carte @user carte` – Donner une carte
`/retirer_carte @user carte` – Retirer une carte
`/stats_serveur` – Statistiques", inline=False)
    await interaction.response.send_message(embed=embed)


@bot.tree.command(name="carte", description="Afficher les informations d'une carte")
@app_commands.describe(nom="Nom de la carte")
async def carte(interaction: discord.Interaction, nom: str):
    await interaction.response.defer()
    server = await get_server(str(interaction.guild_id))
    if not server:
        await interaction.followup.send("❌ Serveur non enregistré.", ephemeral=True)
        return
    cards = await api.list("Card", filters={"server_id": server["id"]})
    found = [c for c in cards if nom.lower() in c["name"].lower()]
    if not found:
        await interaction.followup.send(f"❌ Aucune carte trouvée pour `{nom}`.")
        return
    if len(found) > 1:
        names = "\n".join([f"• {c['name']} ({c.get('rarity', '?')})" for c in found[:10]])
        await interaction.followup.send(f"🔍 Plusieurs cartes trouvées:\n{names}")
        return
    await interaction.followup.send(embed=card_embed(found[0]))


@bot.tree.command(name="collections", description="Lister toutes les collections du serveur")
async def collections_cmd(interaction: discord.Interaction):
    await interaction.response.defer()
    server = await get_server(str(interaction.guild_id))
    if not server:
        await interaction.followup.send("❌ Serveur non enregistré.", ephemeral=True)
        return
    cols = await api.list("Collection", filters={"server_id": server["id"]})
    if not cols:
        await interaction.followup.send("❌ Aucune collection disponible.")
        return
    embed = discord.Embed(title="📚 Collections", color=0x8B5CF6)
    for col in cols:
        status = "✅" if col.get("is_available") else "❌"
        nb_cards_per_booster = col.get("cards_per_booster", CARDS_PER_BOOSTER)
        embed.add_field(
            name=f"{status} {col['name']}",
            value=(col.get("description") or "Pas de description") + f"\n{CARDS_PER_BOOSTER} cartes/booster",
            inline=False
        )
    await interaction.followup.send(embed=embed)


@bot.tree.command(name="collection", description="Voir les cartes d'une collection")
@app_commands.describe(nom="Nom de la collection")
async def collection_cmd(interaction: discord.Interaction, nom: str):
    await interaction.response.defer()
    server = await get_server(str(interaction.guild_id))
    if not server:
        await interaction.followup.send("❌ Serveur non enregistré.", ephemeral=True)
        return
    cols = await api.list("Collection", filters={"server_id": server["id"]})
    found_col = next((c for c in cols if nom.lower() in c["name"].lower()), None)
    if not found_col:
        await interaction.followup.send(f"❌ Collection `{nom}` introuvable.")
        return
    cards = await api.list("Card", filters={"collection_id": found_col["id"]})
    embed = discord.Embed(title=f"📚 {found_col['name']}", description=found_col.get("description", ""), color=0x8B5CF6)
    by_rarity = {}
    for card in cards:
        r = card.get("rarity", "Commun")
        by_rarity.setdefault(r, []).append(card["name"])
    for r in RARITY_ORDER:
        if r in by_rarity:
            embed.add_field(name=f"{RARITY_EMOJIS.get(r, '')} {r}", value=", ".join(by_rarity[r]), inline=False)
    embed.set_footer(text=f"{len(cards)} cartes • {len([c for c in cards if c.get('is_available')])} disponibles")
    await interaction.followup.send(embed=embed)


@bot.tree.command(name="inventaire", description="Voir ton inventaire de cartes et boosters")
async def inventaire(interaction: discord.Interaction):
    await interaction.response.defer(ephemeral=True)
    server = await get_server(str(interaction.guild_id))
    if not server:
        await interaction.followup.send("❌ Serveur non enregistré.", ephemeral=True)
        return

    did = str(interaction.user.id)
    player_cards = await api.list("PlayerCard", filters={"player_discord_id": did, "server_id": server["id"]})
    player_boosters = await api.list("PlayerBooster", filters={"player_discord_id": did, "server_id": server["id"]})

    embed = discord.Embed(title=f"🎒 Inventaire de {interaction.user.display_name}", color=0x8B5CF6)

    if player_cards:
        all_cards = await api.list("Card", filters={"server_id": server["id"]})
        cards_by_id = {c["id"]: c for c in all_cards}
        by_rarity = {}
        total = 0
        for pc in player_cards:
            card = cards_by_id.get(pc.get("card_id"))
            if card:
                r = card.get("rarity", "Commun")
                qty = pc.get("quantity", 1)
                total += qty
                entry = card["name"] + (f" x{qty}" if qty > 1 else "")
                by_rarity.setdefault(r, []).append(entry)
        text = ""
        for r in RARITY_ORDER:
            if r in by_rarity:
                text += f"**{RARITY_EMOJIS.get(r,'')} {r}**: {', '.join(by_rarity[r])}\n"
        embed.add_field(name=f"🃏 Cartes ({total})", value=text[:1024] or "Aucune", inline=False)
    else:
        embed.add_field(name="🃏 Cartes", value="Aucune carte", inline=False)

    if player_boosters:
        cols = await api.list("Collection", filters={"server_id": server["id"]})
        cols_by_id = {c["id"]: c for c in cols}
        lines = [
            f"📦 **{cols_by_id.get(pb.get('collection_id'), {}).get('name', '?')}**: {pb.get('quantity', 0)} booster{'s' if pb.get('quantity', 0) > 1 else ''}"
            for pb in player_boosters if pb.get("quantity", 0) > 0
        ]
        embed.add_field(name="📦 Boosters", value="\n".join(lines) or "Aucun booster", inline=False)
    else:
        embed.add_field(name="📦 Boosters", value="Aucun booster", inline=False)

    await interaction.followup.send(embed=embed, ephemeral=True)


@bot.tree.command(name="ouvrir_booster", description="Ouvrir un booster pour obtenir 3 cartes!")
@app_commands.describe(collection="Nom de la collection du booster")
async def ouvrir_booster(interaction: discord.Interaction, collection: str):
    await interaction.response.defer()
    server = await get_server(str(interaction.guild_id))
    if not server:
        await interaction.followup.send("❌ Serveur non enregistré.", ephemeral=True)
        return

    did = str(interaction.user.id)
    cols = await api.list("Collection", filters={"server_id": server["id"]})
    found_col = next((c for c in cols if collection.lower() in c["name"].lower()), None)
    if not found_col:
        await interaction.followup.send(f"❌ Collection `{collection}` introuvable.")
        return

    boosters = await api.list("PlayerBooster", filters={
        "player_discord_id": did, "collection_id": found_col["id"], "server_id": server["id"],
    })
    booster = next((b for b in boosters if (b.get("quantity") or 0) > 0), None)
    if not booster:
        await interaction.followup.send(
            f"❌ Tu n'as pas de booster pour **{found_col['name']}**! Demande à un admin.", ephemeral=True
        )
        return

    # Only available cards
    all_cards = await api.list("Card", filters={"collection_id": found_col["id"], "server_id": server["id"]})
    available = [c for c in all_cards if c.get("is_available", True)]
    if not available:
        await interaction.followup.send("❌ Aucune carte disponible dans cette collection.")
        return

    # Draw exactly 3 cards (doubles allowed, weighted)
    drawn = weighted_choice(available, CARDS_PER_BOOSTER)

    # Decrement booster
    new_qty = (booster.get("quantity") or 1) - 1
    if new_qty <= 0:
        await api.delete("PlayerBooster", booster["id"])
    else:
        await api.update("PlayerBooster", booster["id"], {"quantity": new_qty})

    # Give cards
    results = []
    for card in drawn:
        is_new = await add_card_to_player(did, card, server["id"], "booster")
        results.append((card, is_new))

    embed = discord.Embed(
        title=f"📦 Booster — {found_col['name']}",
        description=f"{interaction.user.mention} a ouvert un booster:",
        color=0x8B5CF6
    )
    for card, is_new in results:
        rarity = card.get("rarity", "Commun")
        emoji = RARITY_EMOJIS.get(rarity, "")
        label = "✨ NOUVEAU!" if is_new else "🔁 Doublon"
        embed.add_field(name=f"{emoji} {card['name']}", value=f"{rarity} • {label}", inline=True)

    # Thumbnail = rarest card drawn
    rarest_card = min(drawn, key=lambda c: RARITY_ORDER.index(c.get("rarity", "Commun")) if c.get("rarity") in RARITY_ORDER else 99)
    if rarest_card.get("image_url"):
        embed.set_thumbnail(url=rarest_card["image_url"])

    embed.set_footer(text=f"Boosters restants: {new_qty}")
    await interaction.followup.send(embed=embed)


# ─── ADMIN COMMANDS ─────────────────────────────────────────────────────────────

@bot.tree.command(name="donner_booster", description="[ADMIN] Donner un booster à un joueur")
@app_commands.describe(joueur="Le joueur", collection="Nom de la collection", quantite="Quantité (défaut: 1)")
@app_commands.checks.has_permissions(administrator=True)
async def donner_booster(interaction: discord.Interaction, joueur: discord.Member, collection: str, quantite: int = 1):
    await interaction.response.defer(ephemeral=True)
    server = await get_server(str(interaction.guild_id))
    if not server:
        await interaction.followup.send("❌ Serveur non enregistré.")
        return
    cols = await api.list("Collection", filters={"server_id": server["id"]})
    found_col = next((c for c in cols if collection.lower() in c["name"].lower()), None)
    if not found_col:
        await interaction.followup.send(f"❌ Collection `{collection}` introuvable.")
        return
    did = str(joueur.id)
    existing = await api.list("PlayerBooster", filters={"player_discord_id": did, "collection_id": found_col["id"], "server_id": server["id"]})
    if existing:
        pb = existing[0]
        await api.update("PlayerBooster", pb["id"], {"quantity": (pb.get("quantity") or 0) + quantite})
    else:
        await api.create("PlayerBooster", {
            "player_email": f"discord:{did}@discord.com",
            "player_discord_id": did,
            "collection_id": found_col["id"],
            "server_id": server["id"],
            "quantity": quantite,
            "is_opened": False,
        })
    await interaction.followup.send(f"✅ {quantite} booster(s) **{found_col['name']}** donnés à {joueur.mention}!")
    try:
        await joueur.send(f"📦 Tu as reçu **{quantite}** booster(s) **{found_col['name']}** sur **{interaction.guild.name}**!\nUtilise `/ouvrir_booster {found_col['name']}`!")
    except:
        pass


@bot.tree.command(name="donner_carte", description="[ADMIN] Donner une carte à un joueur")
@app_commands.describe(joueur="Le joueur", carte_nom="Nom de la carte")
@app_commands.checks.has_permissions(administrator=True)
async def donner_carte(interaction: discord.Interaction, joueur: discord.Member, carte_nom: str):
    await interaction.response.defer(ephemeral=True)
    server = await get_server(str(interaction.guild_id))
    if not server:
        await interaction.followup.send("❌ Serveur non enregistré.")
        return
    cards = await api.list("Card", filters={"server_id": server["id"]})
    found = [c for c in cards if carte_nom.lower() in c["name"].lower()]
    if not found:
        await interaction.followup.send(f"❌ Carte `{carte_nom}` introuvable.")
        return
    if len(found) > 1:
        names = "\n".join([f"• {c['name']}" for c in found[:10]])
        await interaction.followup.send(f"🔍 Plusieurs cartes:\n{names}\nSoyez plus précis.")
        return
    card = found[0]
    is_new = await add_card_to_player(str(joueur.id), card, server["id"], "admin_give")
    label = "✨ Nouvelle carte" if is_new else "🔁 Doublon (+1)"
    await interaction.followup.send(f"✅ **{card['name']}** donnée à {joueur.mention}! {label}")


@bot.tree.command(name="retirer_carte", description="[ADMIN] Retirer une carte d'un joueur")
@app_commands.describe(joueur="Le joueur", carte_nom="Nom de la carte")
@app_commands.checks.has_permissions(administrator=True)
async def retirer_carte(interaction: discord.Interaction, joueur: discord.Member, carte_nom: str):
    await interaction.response.defer(ephemeral=True)
    server = await get_server(str(interaction.guild_id))
    if not server:
        await interaction.followup.send("❌ Serveur non enregistré.")
        return
    cards = await api.list("Card", filters={"server_id": server["id"]})
    found = next((c for c in cards if carte_nom.lower() in c["name"].lower()), None)
    if not found:
        await interaction.followup.send(f"❌ Carte `{carte_nom}` introuvable.")
        return
    pcs = await api.list("PlayerCard", filters={"player_discord_id": str(joueur.id), "card_id": found["id"], "server_id": server["id"]})
    if not pcs:
        await interaction.followup.send(f"❌ {joueur.display_name} ne possède pas cette carte.")
        return
    pc = pcs[0]
    qty = pc.get("quantity", 1)
    if qty > 1:
        await api.update("PlayerCard", pc["id"], {"quantity": qty - 1})
    else:
        await api.delete("PlayerCard", pc["id"])
    await interaction.followup.send(f"✅ **{found['name']}** retirée à {joueur.mention}.")


@bot.tree.command(name="stats_serveur", description="[ADMIN] Statistiques du serveur")
@app_commands.checks.has_permissions(administrator=True)
async def stats_serveur(interaction: discord.Interaction):
    await interaction.response.defer()
    server = await get_server(str(interaction.guild_id))
    if not server:
        await interaction.followup.send("❌ Serveur non enregistré.")
        return
    cards = await api.list("Card", filters={"server_id": server["id"]})
    cols = await api.list("Collection", filters={"server_id": server["id"]})
    pcs = await api.list("PlayerCard", filters={"server_id": server["id"]})
    pbs = await api.list("PlayerBooster", filters={"server_id": server["id"]})
    embed = discord.Embed(title=f"📊 Stats — {interaction.guild.name}", color=0x8B5CF6)
    embed.add_field(name="📚 Collections", value=len(cols), inline=True)
    embed.add_field(name="🃏 Cartes créées", value=len(cards), inline=True)
    embed.add_field(name="🎒 Cartes en circulation", value=sum(pc.get("quantity", 1) for pc in pcs), inline=True)
    embed.add_field(name="📦 Boosters non ouverts", value=sum(pb.get("quantity", 0) for pb in pbs), inline=True)
    await interaction.followup.send(embed=embed)


@bot.tree.error
async def on_app_command_error(interaction: discord.Interaction, error: app_commands.AppCommandError):
    if isinstance(error, app_commands.MissingPermissions):
        msg = "❌ Tu n'as pas la permission d'utiliser cette commande."
    else:
        msg = f"❌ Erreur: {str(error)}"
        print(f"Erreur commande: {error}")
    if interaction.response.is_done():
        await interaction.followup.send(msg, ephemeral=True)
    else:
        await interaction.response.send_message(msg, ephemeral=True)


if __name__ == "__main__":
    bot.run(DISCORD_TOKEN)
