/*
 * Worker de Cloudflare: deja en un canal de Discord quien entra y sale del juego.
 * =============================================================================
 * POR QUE HAY UN WORKER Y NO UN TOKEN EN EL INSTALADOR
 * ---------------------------------------------------
 * Lo obvious seria meter el token del bot dentro del `.exe` y que el launcher
 * escribiera en el canal. Eso NO se puede hacer: cualquiera que descargue el
 * instalador puede abrirlo y sacar el token en un minuto, y con el puede
 * escribir en tu canal o invitarse a otros servidores. Da igual como este
 * escrito: va dentro de un archivo publico.
 *
 * Aqui el secreto NO viaja. El launcher manda un POST con el evento y el
 * Worker, que guarda el token como secreto de Cloudflare, es quien habla con
 * Discord. El token no sale del Worker nunca.
 *
 * QUE ESCRIBE
 * -----------
 * Una linea por entrada y por salida, con el nombre de Minecraft Y el usuario de
 * Discord verificado. No se manda solo el nombre de Minecraft porque ese lo
 * escribe el jugador en su launcher: no dice nada de quien es.
 *
 * QUIEN PUEDE ESCRIBIR
 * --------------------
 * Aqui no hay ningun secreto en el cliente, asi que cualquiera podria llamar a
 * este Worker. No pasa nada: antes de escribir, el Worker comprueba con la API
 * de Discord que ese usuario este EN EL SERVIDOR y tenga el rol que se haya
 * configurado. Es decir, solo se loguean los que de verdad son miembros. Un
 * desconocido recibe un 403 y no aparece nada en el canal.
 *
 * ADEMAS, UN TECHO
 * ----------------
 * Aunque un miembro se pase de pesado, hay un tope por usuario: el Worker
 * recuerda las ultimas entradas en la cache y si alguien pulso 200 veces
 * seguidas, solo pasan las primeras.
 *
 * MONTARLO
 * --------
 *   1. Discord -> Developers -> Applications -> New Application -> Bot ->
 *      Reset Token. Copia el token.
 *   2. Invita al bot a tu servidor con SOLO estos permisos en el canal que
 *      quieras: View Channel, Send Messages, Embed Links. Nada mas. Si puede
 *      banear o administrar, sobra y sobra el riesgo.
 *   3. Workers & Pages -> tu Worker -> Settings -> Variables and Secrets:
 *        DISCORD_BOT_TOKEN   (Secret)   -> el token del punto 1
 *        DISCORD_CHANNEL_ID  (Secret)   -> el ID del canal
 *        DISCORD_GUILD_ID    (Secret)   -> el ID del servidor
 *        DISCORD_ROLE_ID     (Variable) -> opcional: solo estos usuarios
 *      Y en el portal del bot: Server Members Intent -> ON.
 *   4. Copia la direccion del Worker en `config.AVISOS_API`
 *      (`src/lilasafio/config.py`) o en la variable LILOSAFIO_AVISOS_URL.
 *
 * GET  /estado  -> si esta configurado. Para comprobarlo sin instalar nada.
 * POST /entrar  -> { "minecraft": "...", "discordId": "...", "discordName": "..." }
 * POST /salir   -> lo mismo
 */

const EVENTOS = {
  entrar: { color: 0x57f287, titulo: "ha entrado al juego", icono: "\u{1F579}\u{FE0F}" },
  salir: { color: 0xed4245, titulo: "ha salido del juego", icono: "\u{1F6D1}" },
};

// Cuantos eventos se guardan por usuario para poder aplicar el techo.
const MAX_POR_USUARIO = 60;
// Los nombres de Minecraft son [A-Za-z0-9_]{3,16}. Cortar aqui evita que
// alguien meta texto raro en un embed del canal.
const RE_NOMBRE = /^[A-Za-z0-9_]{1,24}$/;
// El id de Discord es un numero, nada mas.
const RE_ID = /^\d{5,25}$/;
const TIMEOUT_MS = 5000;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/estado") {
      return json({
        ok: true,
        configurado: Boolean(env.DISCORD_BOT_TOKEN && env.DISCORD_CHANNEL_ID),
        conRol: Boolean(env.DISCORD_ROLE_ID),
      });
    }

    if (request.method !== "POST") {
      return json({ ok: false, error: "solo se acepta POST" }, 405);
    }

    // Sin configuracion el Worker no falla: contesta que no hay nada que hacer,
    // para que el launcher, que espera respuesta, no se quede pensando.
    if (!env.DISCORD_BOT_TOKEN || !env.DISCORD_CHANNEL_ID) {
      return json({ ok: false, error: "worker sin configurar" }, 503);
    }

    const evento = url.pathname.slice(1);
    if (!EVENTOS[evento]) {
      return json({ ok: false, error: "evento desconocido" }, 400);
    }

    let datos;
    try {
      datos = await request.json();
    } catch {
      return json({ ok: false, error: "cuerpo no valido" }, 400);
    }

    const discordId = String(datos.discordId || "");
    const discordName = String(datos.discordName || "").slice(0, 40);
    const minecraft = String(datos.minecraft || "").slice(0, 24);

    // El id de Discord es lo unico que de verdad hace falta: es lo que se
    // comprueba contra el servidor. Si no hay id, no hay quien comprobar.
    if (!RE_ID.test(discordId)) {
      return json({ ok: false, error: "falta discordId" }, 400);
    }
    if (minecraft && !RE_NOMBRE.test(minecraft)) {
      return json({ ok: false, error: "nombre de Minecraft no valido" }, 400);
    }

    // El techo va ANTES de llamar a Discord, para que un abuson no consuma ni
    // una peticion. Se cuenta con la cache de este mismo Worker.
    const cache = caches.default;
    const clave = new Request(`${url.origin}/_cuenta/${discordId}`);
    const previa = await cache.match(clave);
    let marcas = [];
    if (previa) {
      try {
        marcas = await previa.json();
      } catch {
        marcas = [];
      }
    }
    const ahora = Date.now();
    const unaHora = ahora - 3600 * 1000;
    marcas = marcas.filter((m) => m > unaHora);
    if (marcas.length >= MAX_POR_USUARIO) {
      return json({ ok: false, error: "demasiados eventos" }, 429);
    }

    const membresia = await _es_miembro(env, discordId);
    if (!membresia.ok) {
      return json({ ok: false, error: membresia.error }, membresia.codigo);
    }

    marcas.push(ahora);
    ctx.waitUntil(
      cache.put(
        clave,
        new Response(JSON.stringify(marcas), {
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "public, max-age=3600",
          },
        })
      )
    );

    const estilo = EVENTOS[evento];
    const quien = discordName || `id ${discordId}`;
    const cuerpo = {
      username: "LiloSafio",
      embeds: [
        {
          description: `${estilo.icono} **${escapar(quien)}** ${estilo.titulo}`,
          color: estilo.color,
          fields: [
            { name: "Minecraft", value: `\`${escapar(minecraft || "?")}\``, inline: true },
            { name: "Discord", value: `<@${discordId}>`, inline: true },
          ],
          footer: { text: "LiloSafio" },
          timestamp: new Date(ahora).toISOString(),
        },
      ],
    };

    const control = AbortSignal.timeout ? AbortSignal.timeout(TIMEOUT_MS) : undefined;
    const respuesta = await fetch(
      `https://discord.com/api/v10/channels/${env.DISCORD_CHANNEL_ID}/messages`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
        },
        body: JSON.stringify(cuerpo),
        signal: control,
      }
    );

    if (!respuesta.ok) {
      const detalle = await respuesta.text().catch(() => "");
      return json(
        { ok: false, error: `discord ${respuesta.status}`, detalle: detalle.slice(0, 200) },
        502
      );
    }

    return json({ ok: true });
  },
};

/**
 * Comprueba que el usuario este en el servidor, y con el rol si hay uno puesto.
 *
 * Se hace con el bot, que es la unica forma de saberlo sin que el jugador
 * mande su token. Es una llamada extra por evento, pero un evento es una
 * entrada y una salida: da igual. Y es lo que evita que el canal se llene de
 * gente que no esta en el servidor.
 */
async function _es_miembro(env, discordId) {
  const cabeceras = { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` };
  const control = AbortSignal.timeout ? AbortSignal.timeout(TIMEOUT_MS) : undefined;
  try {
    const r = await fetch(
      `https://discord.com/api/v10/guilds/${env.DISCORD_GUILD_ID}/members/${discordId}`,
      { headers: cabeceras, signal: control }
    );
    // 404 = no esta en el servidor. 403 = el bot no puede mirarlo (le falta el
    // permiso Server Members Intent): no es lo mismo que «no es miembro», y se
    // distinguen para no decir que alguien fue rechazado cuando lo que falta es
    // un permiso.
    if (r.status === 404) return { ok: false, error: "no esta en el servidor", codigo: 403 };
    if (r.status === 403) return { ok: false, error: "falta Server Members Intent", codigo: 403 };
    if (!r.ok) return { ok: false, error: `discord ${r.status}`, codigo: 502 };

    if (env.DISCORD_ROLE_ID) {
      const miembro = await r.json();
      if (!(miembro.roles || []).includes(env.DISCORD_ROLE_ID)) {
        return { ok: false, error: "sin el rol necesario", codigo: 403 };
      }
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "no se pudo comprobar", codigo: 502 };
  }
}

// El texto viene del cliente, asi que se escapa antes de meterse en un embed.
function escapar(texto) {
  return String(texto).replace(/[*_`~|>[\]()]/g, "\\$&").slice(0, 60);
}

function json(cuerpo, codigo) {
  return new Response(cuerpo, {
    status: codigo || 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store",
    },
  });
}
