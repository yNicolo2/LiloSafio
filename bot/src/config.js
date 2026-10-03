"use strict";

/**
 * Configuracion del bot. Lee de `.env` y falla si falta algo.
 *
 * El token NUNCA esta en el codigo. Va en `.env`, que esta en `.gitignore`, y
 * eso no es por custombre sino por una razon muy concreta: el codigo se sube a
 * un repositorio, y un token en un repositorio es un token publico. Con el
 * token, cualquiera puede escribir en tus canales, leerlos y usar tu bot.
 *
 * Por eso `comprobar.js` dice que falta y por que, en vez de dejar que el bot
 * se caiga al arrancar sin decir nada.
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

/** Lee una variable obligatoria y, si falta, dice exactamente que hacer. */
function _obligatorio(nombre, ayuda) {
  const valor = (process.env[nombre] || "").trim();
  if (!valor) {
    throw new Error(
      `Falta ${nombre} en el .env.\n` +
        `  ${ayuda}\n` +
        `  Copia .env.example a .env y rellenalo.`
    );
  }
  return valor;
}

/** Lee una variable opcional. */
function _opcional(nombre, porDefecto = "") {
  return (process.env[nombre] || "").trim() || porDefecto;
}

let _config = null;

/** La configuracion, leida una sola vez. */
function cargar() {
  if (_config) return _config;
  _config = {
    token: _obligatorio(
      "DISCORD_TOKEN",
      "Discord -> Developers -> Applications -> tu bot -> Reset Token."
    ),
    clientId: _obligatorio(
      "DISCORD_CLIENT_ID",
      "Es el numero de la URL de la pagina del bot en Discord."
    ),
    guildId: _obligatorio("DISCORD_GUILD_ID", "Developer Portal > General Information."),
    canalAvisos: _opcional("DISCORD_CANAL_AVISOS"),
    rolAvisos: _opcional("DISCORD_ROL_AVISOS"),
    archivoSorteos: path.join(
      __dirname,
      "..",
      _opcional("DISCORD_ARCHIVO_SORTEOS", "sorteos.json")
    ),
  };
  return _config;
}

/** Que falta, para poder decirlo sin tirar el proceso. */
function que_falta() {
  const faltan = [];
  if (!(process.env.DISCORD_TOKEN || "").trim()) faltan.push("DISCORD_TOKEN");
  if (!(process.env.DISCORD_CLIENT_ID || "").trim()) faltan.push("DISCORD_CLIENT_ID");
  if (!(process.env.DISCORD_GUILD_ID || "").trim()) faltan.push("DISCORD_GUILD_ID");
  return faltan;
}

module.exports = { cargar, que_falta };
