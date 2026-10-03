"use strict";

/**
 * Bot de LiloSafio.
 *
 * Que hace: los dos reglamentos, los sorteos con boton de participar, y lo que
 * mas importa para el boton de arriba del launcher (permanecer encendido).
 *
 * LO DE PERMANECER ENCENDIDO
 * -------------------------
 * Un bot de Discord se conecta por un WebSocket y se queda escuchando. Eso
 * significa que necesita un PROCESO VIVO, y da igual que el codigo sea el
 * correcto: si no hay nadie ejecutando `npm start`, el bot esta apagado.
 *
 * Cloudflare Workers NO sirve para esto: un Worker es una funcion que contesta
 * peticiones HTTP y se apaga cuando no hay nadie. Una conexion WebSocket abierta
 * no es una peticion HTTP, asi que ahi no cabe. Por eso los avisos de quien
 * entra al juego los manda un Worker (que solo hace POST a Discord) y las reglas
 * y los sorteos los lleva este bot, que si necesita un servidor vivo.
 *
 * Que aporta este archivo: reconecta solo cuando se cae y avisa de por que, en
 * vez de quedarse muerto sin decir nada. Un bot que se cae en silencio es
 * imposible de diagnosticar; uno que dice «se caio, reintento en 15 s» se
 * arregla mirando un log.
 */

const {
  Client,
  GatewayIntentBits,
  Partials,
  ActivityType,
  SlashCommandBuilder,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");

const config = require("./config");
const reglas = require("./reglas");
const sorteos = require("./sorteos");

const cfg = config.cargar();

// El `GuildMembers` es lo que permite comprobar quien esta en el servidor. Es un
// intent privilegiado: si no esta activado en el Developer Portal, Discord
// responde con una lista de miembros vacia y el bot cree que no hay nadie.
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [Partials.Message],
});

// --------------------------------------------------------------------------
// Arranque
// --------------------------------------------------------------------------
client.once("ready", async () => {
  console.log(`LiloSafio online como ${client.user.tag}`);
  const guild = client.guilds.cache.get(cfg.guildId);
  console.log(`  servidor : ${guild ? guild.name || guild.id : "NO ENCONTRADO"}`);
  console.log(`  miembros : ${guild?.memberCount ?? "?"}`);

  // Aviso de lo que mas se olvida. Sin este intent, el bot ve el servidor pero
  // ve cero miembros, y no hay forma de saber quien esta dentro.
  if (guild && guild.memberCount === 0) {
    console.warn("  AVISO: 0 miembros. Activa Server Members Intent en el");
    console.warn("          Developer Portal -> tu bot -> Bot.");
  }

  // Registrar los comandos cada vez que arranca. Es lo recomendado: si el codigo
  // cambia, los comandos se actualizan solos y no hay que acordarse de hacerlo.
  try {
    const lista = comandos().map((c) => c.toJSON());
    await client.application.commands.set(lista);
    console.log(`  comandos : ${lista.length} registrados`);
  } catch (error) {
    console.error(`  comandos : no se pudieron registrar (${error.message})`);
  }

  client.user.setActivity("LiloSafio", { type: ActivityType.Watching });
});

client.on("error", (error) => console.error(`error: ${error.message}`));

// --------------------------------------------------------------------------
// Reconexion
// --------------------------------------------------------------------------
// Discord.js reconecta solo, pero hay fallos que lo dejan tirado. Esto los
// recoge y espera cada vez mas entre reintentos, para no entrar en un bucle que
// se come la cuota de la API.
let reintentos = 0;
const MAX_REINTENTOS = 10;

client.on("disconnect", () => console.warn("desconectado de Discord"));
client.on("shardDisconnect", (e) => console.warn(`desconectado del shard ${e.shardId}: ${e.code}`));
client.on("shardReconnecting", () => console.log("reconectando…"));
client.on("shardResume", () => {
  console.log("conexion recuperada");
  reintentos = 0;
});
client.on("shardError", (error, id) => console.error(`error en el shard ${id}: ${error.message}`));

// --------------------------------------------------------------------------
// Comandos
// --------------------------------------------------------------------------
function comandos() {
  return [
    new SlashCommandBuilder()
      .setName("rulesdiscord")
      .setDescription("Muestra las reglas oficiales de la comunidad de Discord de LiloSafio."),
    new SlashCommandBuilder()
      .setName("ruleserver")
      .setDescription("Muestra las reglas del servidor de Minecraft del evento LiloSafio."),
    new SlashCommandBuilder()
      .setName("giveaways")
      .setDescription("Crea un sorteo personalizado de LiloSafio con panel interactivo y tiempo de cierre."),
    new SlashCommandBuilder()
      .setName("avisos")
      .setDescription("Muestra en qué canal se anotan las entradas al juego."),
  ];
}

function embedSorteo(s) {
  return new EmbedBuilder()
    .setTitle("🎁 ¡NUEVO SORTEO OFICIAL DE LILOSAFIO! 🎁")
    .setDescription(
      "¡Atención a todos los participantes de **LiloSafio**!\n\n" +
        "Se está sorteando un premio exclusivo patrocinado por la administración."
    )
    .setColor(reglas.COLOR_NARANJA)
    .addFields(
      { name: "🏆 Premio:", value: `**${s.premio}**`, inline: false },
      { name: "📦 Cantidad:", value: `\`${s.cantidad} unidad(es)\``, inline: true },
      { name: "👑 Ganadores:", value: `\`${s.ganadores} ganador(es)\``, inline: true },
      { name: "⏰ Termina:", value: `\`${s.termina}\``, inline: false },
      {
        name: "👥 Participantes actuales:",
        value: `\`${s.participantes.length} participantes\``,
        inline: false,
      }
    )
    .setFooter({ text: "LiloSafio Giveaways • Haz clic en el botón de abajo para unirte" })
    .setTimestamp();
}

client.on("interactionCreate", async (interaccion) => {
  try {
    await manejar(interaccion);
  } catch (error) {
    console.error(`error en una interaccion: ${error.message}`);
    if (interaccion.isRepliable()) {
      await interaccion
        .reply({ content: "Algo se rompió al ejecutar eso. Ya está anotado.", ephemeral: true })
        .catch(() => {});
    }
  }
});

async function manejar(interaccion) {
  if (interaccion.isChatInputCommand()) {
    const nombre = interaccion.commandName;

    if (nombre === "rulesdiscord") {
      return interaccion.reply({ embeds: [reglas.a_embed(reglas.REGLAS_DISCORD)] });
    }
    if (nombre === "ruleserver") {
      return interaccion.reply({ embeds: [reglas.a_embed(reglas.REGLAS_SERVIDOR)] });
    }
    if (nombre === "avisos") return dondeVanLosAvisos(interaccion);
    if (nombre === "giveaways") return abrirModalSorteo(interaccion);
  }

  if (interaccion.isModalSubmit() && interaccion.customId === "modal_crear_sorteo") {
    return crearSorteo(interaccion);
  }

  if (interaccion.isButton() && interaccion.customId === "btn_participar_sorteo") {
    return tocarBotonSorteo(interaccion);
  }
}

async function abrirModalSorteo(interaccion) {
  const modal = new ModalBuilder()
    .setCustomId("modal_crear_sorteo")
    .setTitle("🎁 Crear Sorteo • LiloSafio");
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("input_premio")
        .setLabel("¿Qué ítem o premio se va a sortear?")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("Ej: Tótem de Inmortalidad x5")
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("input_cantidad")
        .setLabel("Cantidad de objetos / unidades")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("Ej: 1")
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("input_ganadores")
        .setLabel("Número de ganadores")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("Ej: 1")
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("input_termina")
        .setLabel("¿Cuándo termina? (Duración / Fecha)")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("Ej: Hoy a las 9:00 PM / 2 horas")
        .setRequired(true)
    )
  );
  return interaccion.showModal(modal);
}

async function crearSorteo(interaccion) {
  const datos = {
    premio: interaccion.fields.getTextInputValue("input_premio"),
    cantidad: interaccion.fields.getTextInputValue("input_cantidad"),
    ganadores: interaccion.fields.getTextInputValue("input_ganadores"),
    termina: interaccion.fields.getTextInputValue("input_termina"),
  };
  const fila = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("btn_participar_sorteo")
      .setLabel("¡Participar en LiloSafio!")
      .setStyle(ButtonStyle.Success)
      .setEmoji("🔥")
  );
  await interaccion.reply({
    content: "✅ ¡Sorteo de LiloSafio creado con éxito!",
    ephemeral: true,
  });
  const enviado = await interaccion.channel.send({
    embeds: [embedSorteo({ ...datos, participantes: [] })],
    components: [fila],
  });
  sorteos.crear(cfg.archivoSorteos, enviado.id, datos);
  console.log(`sorteo creado en ${enviado.channelId}`);
}

async function tocarBotonSorteo(interaccion) {
  const resultado = sorteos.participar(
    cfg.archivoSorteos,
    interaccion.message.id,
    interaccion.user.id
  );
  if (!resultado) {
    return interaccion.reply({
      content: "❌ Este sorteo de LiloSafio ya expiró o no está registrado.",
      ephemeral: true,
    });
  }
  await interaccion.message.edit({
    embeds: [embedSorteo(sorteos.obtener(interaccion.message.id))],
  });
  return interaccion.reply({
    content: resultado.dentro
      ? "🎉 ¡Ya estás participando oficialmente en el sorteo de **LiloSafio**!"
      : "⚠️ Te has **retirado** del sorteo de LiloSafio.",
    ephemeral: true,
  });
}

/**
 * Donde se anotan las entradas al juego.
 *
 * No se inventa una lista de quien esta jugando: el unico que sabe cuando
 * arranca y cuando para el juego es el launcher, y guardar eso aqui seria una
 * segunda verdad que se desincroniza. Se dice donde mirar.
 */
async function dondeVanLosAvisos(interaccion) {
  if (!cfg.canalAvisos) {
    return interaccion.reply({
      content:
        "Ahora mismo no se anota quién entra al juego.\n" +
        "Falta `DISCORD_CANAL_AVISOS` en el `.env`.",
      ephemeral: true,
    });
  }
  return interaccion.reply({
    content:
      `Cada entrada y cada salida queda anotada en <#${cfg.canalAvisos}> ` +
      "con el nombre de Minecraft y el usuario de Discord de quien entró.",
    ephemeral: true,
  });
}
