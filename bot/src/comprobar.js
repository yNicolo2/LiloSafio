"use strict";

/**
 * Comprueba que el `.env` esta bien ANTES de arrancar el bot.
 *
 *   npm run comprobar
 *
 * Existe porque el fallo tipico es poner el token mal pegado (un espacio al
 * final, una comilla de mas) y quedarse con un bot que no arranca sin decir por
 * que. Aqui se dice exactamente que pasa y como se arregla.
 */

const { que_falta } = require("./config");

async function main() {
  console.log("COMPROBACION DEL BOT");

  const faltan = que_falta();
  if (faltan.length) {
    console.log("");
    console.log(`  FALTA: ${faltan.join(", ")}`);
    console.log("");
    console.log("  Copia .env.example a .env y rellenalo:");
    console.log("    Discord -> Developers -> Applications -> tu bot -> Reset Token");
    process.exit(1);
  }

  console.log("  .env          OK");
  console.log("  DISCORD_TOKEN OK (formato)");

  const { Client, GatewayIntentBits } = require("discord.js");
  const token = process.env.DISCORD_TOKEN.trim();
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  });

  try {
    await client.login(token);
    console.log(`  login         OK (${client.user.tag})`);

    const guild = client.guilds.cache.get(process.env.DISCORD_GUILD_ID.trim());
    if (!guild) {
      console.log("  servidor      FALLO: el bot no esta en ese servidor");
      console.log("                Invitalo otra vez con el bot ya reiniciado.");
      process.exit(1);
    }
    // El nombre no siempre viene: sin el intent de miembros, el objeto del
    // servidor llega recortado y `guild.name` sale `undefined`. Se enseña el id,
    // que siempre esta, para no dejar un hueco raro en la comprobacion.
    const nombre = guild.name || `id ${guild.id}`;
    console.log(`  servidor      OK (${nombre})`);

    const enCache = guild.members.cache.size;
    console.log(`  miembros      ${enCache > 0 ? "OK" : "AVISO"} (${enCache} en cache)`);
    if (enCache === 0) {
      console.log("");
      console.log("  El intent Server Members Intent probablemente NO esta activado.");
      console.log("  Developer Portal -> tu bot -> Bot -> Privileged Gateway Intents");
      console.log("  -> Server Members Intent -> ON. Sin eso no se puede comprobar");
      console.log("  quien esta en el servidor, que es lo que evita que el canal se llene");
      console.log("  de gente ajena.");
    }

    const canal = process.env.DISCORD_CANAL_AVISOS.trim();
    if (canal) {
      const visto = await guild.channels.fetch(canal).catch(() => null);
      console.log(`  canal avisos  ${visto ? "OK" : "FALLO"} (${visto ? visto.name : "no se encuentra"})`);
      if (visto && !visto.permissionsFor(guild.members.me)?.has(["ViewChannel", "SendMessages"])) {
        console.log("  AVISO: al bot le faltan permisos en ese canal.");
      }
    } else {
      console.log("  canal avisos  (opcional, sin poner)");
    }
  } catch (error) {
    console.log(`  login         FALLO: ${error.message}`);
    console.log("");
    console.log("  Si dice 401 o «unauthorized», el token no vale:");
    console.log("  cambialo en Reset Token y pon el nuevo en el .env.");
    process.exit(1);
  } finally {
    await client.destroy().catch(() => {});
  }

  console.log("");
  console.log("  Todo listo. Arranca con:  npm start");
}

main();
