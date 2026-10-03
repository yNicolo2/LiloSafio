"use strict";

/** Los dos reglamentos, tal cual estaban, separados en su propio archivo. */

const COLOR_NARANJA = 0xf39c12;
const COLOR_AMARILLO = 0xf1c40f;

const REGLAS_DISCORD = {
  titulo: "📜 Reglamento Oficial de Discord • LiloSafio",
  descripcion:
    "Para mantener un ambiente épico, competitivo y libre de toxicidad en **LiloSafio**, " +
    "todos los participantes deben cumplir estrictamente estas normas:",
  color: COLOR_NARANJA,
  campos: [
    {
      name: "1. Respeto Absoluto en LiloSafio",
      value:
        "Cero insultos graves, acoso, discriminación o toxicidad excesiva hacia " +
        "otros miembros o creadores de contenido de LiloSafio.",
    },
    {
      name: "2. Cero Spam y Flood",
      value:
        "Prohibido saturar los canales de texto de LiloSafio con enlaces no " +
        "autorizados, texto repetido o menciones masivas innecesarias.",
    },
    {
      name: "3. Uso Correcto de Canales en LiloSafio",
      value:
        "Respeta la temática de cada canal (usa general para charlar, comandos " +
        "para el bot y los canales de voz adecuados).",
    },
    {
      name: "4. Identidad y Cuentas",
      value:
        "No está permitida la suplantación de identidad de otros usuarios, staff " +
        "o participantes dentro de la comunidad de LiloSafio.",
    },
    {
      name: "5. Cero Contenido NSFW",
      value:
        "Queda terminantemente prohibido compartir imágenes, vídeos o lenguaje " +
        "con contenido explícito o inapropiado en LiloSafio.",
    },
  ],
  pie: { text: "LiloSafio Discord Security • ¡Juega limpio!" },
};

const REGLAS_SERVIDOR = {
  titulo: "⛏ Reglamento del Servidor de Minecraft • LiloSafio",
  descripcion:
    "Normas oficiales de supervivencia, hardcore y juego limpio diseñadas para " +
    "la experiencia de **LiloSafio**:",
  color: COLOR_AMARILLO,
  campos: [
    {
      name: "1. Cero Hacks y Clientes Ilegales",
      value:
        "Prohibido terminantemente usar X-Ray, macros con ventajas competitivas, " +
        "hacks de movimiento o clientes no autorizados en LiloSafio.",
    },
    {
      name: "2. No Griefing Excesivo",
      value:
        "Respeta las bases y construcciones ajenas a menos que las mecánicas " +
        "oficiales del evento LiloSafio indiquen un periodo de guerra o raid.",
    },
    {
      name: "3. Fair play Estricto en PvP",
      value:
        "Demuestra tu habilidad limpiamente en las modalidades de combate de " +
        "LiloSafio. Abusar intencionalmente de bugs del servidor conllevará baneo " +
        "inmediato.",
    },
    {
      name: "4. Alianzas y Traiciones",
      value:
        "Las alianzas dentro de LiloSafio corren bajo tu propio riesgo. ¡La " +
        "traición es parte del juego, pero el respeto fuera de él es obligatorio!",
    },
    {
      name: "5. Reporte Obligatorio de Exploits",
      value:
        "Si encuentras un error crítico o bug en LiloSafio, repórtalo " +
        "inmediatamente al staff en lugar de sacar ventaja injusta.",
    },
  ],
  pie: { text: "LiloSafio Hardcore Server • ¡Que gane el mejor!" },
};

/** Convierte una plantilla de regla en el embed que va al chat. */
function a_embed(reglas) {
  return {
    title: reglas.titulo,
    description: reglas.descripcion,
    color: reglas.color,
    fields: reglas.campos,
    footer: reglas.pie,
  };
}

module.exports = { REGLAS_DISCORD, REGLAS_SERVIDOR, a_embed, COLOR_NARANJA };
