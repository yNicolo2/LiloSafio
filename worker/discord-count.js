/*
 * Worker de Cloudflare para el contador de Discord.
 * =============================================================================
 * POR QUE ESTO EXISTE
 * -------------------
 * La API de Discord no manda cabeceras CORS, asi que el navegador de la web no
 * puede llamarla directamente. Hasta ahora se resolvia pasando por proxies
 * publicos, que son intermitentes por naturaleza: a veces 3 en linea, a veces
 * ninguno, y cuando cae el contador se queda congelado en el ultimo dato.
 *
 * Este Worker lo resuelve de otra manera: llama a Discord desde el servidor,
 * guarda la respuesta en la cache de Cloudflare y la reparte. Coste cero para
 * quien lo visita, estable, y sin depender de que un tercero siga en pie.
 *
 * QUE GUARDA Y CUANTO
 * -------------------
 * La presencia online no cambia de golpe: 60 segundos de cache es invisible y
 * quita casi todas las peticiones a Discord. Ademas, si Discord falla, se
 * devuelve el ultimo dato bueno que hubiera en la cache en vez de un error.
 *
 * INSTALAR
 * --------
 *   1. En Cloudflare: Workers & Pages > Create > Worker.
 *   2. Pegar este archivo y desplegar.
 *   3. Anadir el dominio al que se publica en `site/site.config.json`
 *      (clave `servidor.api`). Si no se pone, el sitio sigue funcionando con
 *      los proxies de antes: es un empujon, no un requisito.
 *
 * El token del boton no va aqui: Discord no lo pide para leer una invitacion.
 */

const TTL_SEGUNDOS = 60;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // El codigo de la invitacion se pasa en la URL: /<invitacion>
    // Se lee del Worker, no de la pagina, para poder cambiarlo sin redesplegar
    // la web entera.
    const invitacion = (url.pathname.split("/")[1] || env.DISCORD_INVITE || "").trim();
    if (!invitacion || !/^[\w-]{2,64}$/.test(invitacion)) {
      return json({ ok: false, error: "invitacion no valida" }, 400);
    }

    const cache = caches.default;
    const clave = new Request(url.origin + "/api/discord/" + invitacion, {
      headers: { Accept: "application/json" },
    });

    // 1. La cache primero. Esto es lo que hace que no se llame a Discord por
    //    cada visita.
    const guardada = await cache.match(clave);
    if (guardada) {
      const copia = new Response(guardada.body, cabecerasCORS(guardada));
      copia.headers.set("X-Lilo-Cache", "1");
      return copia;
    }

    // 2. Discord. Se pide `with_counts` para que venga la presencia online.
    const destino =
      "https://discord.com/api/v10/invites/" +
      encodeURIComponent(invitacion) +
      "?with_counts=true&with_expiration=true";

    try {
      const control = AbortSignal.timeout ? AbortSignal.timeout(4000) : undefined;
      const respuesta = await fetch(destino, {
        headers: {
          "User-Agent": "LiloSafioWeb/1.0 (lilosafio.pages.dev)",
          Accept: "application/json",
        },
        signal: control,
      });
      if (!respuesta.ok) throw new Error("discord " + respuesta.status);
      const datos = await respuesta.json();

      // `approximate_presence` es quien esta conectado ahora. Si Discord no lo
      // manda, se deja en null en vez de poner un 0: «0» afirma algo que en
      // realidad no se sabe.
      const enLinea = datos.approximate_presence ?? null;
      const miembros = datos.approximate_member_count ?? null;

      const cuerpo = JSON.stringify({
        ok: true,
        online: enLinea,
        miembros,
        nombre: datos.guild?.name || datos.code || "",
      });

      const limpia = new Response(cuerpo, {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "public, max-age=" + TTL_SEGUNDOS,
        },
      });
      ctx.waitUntil(cache.put(clave, limpia.clone()));
      return limpia;
    } catch (error) {
      // Si Discord falla pero hay un dato viejo, se sirve el viejo: el contador
      // se queda en el ultimo valor conocido en vez de desaparecer.
      const viejo = await cache.match(clave, { ignoreMethod: true });
      if (viejo) {
        const copia = new Response(viejo.body, cabecerasCORS(viejo));
        copia.headers.set("X-Lilo-Cache", "1");
        return copia;
      }
      return json({ ok: false, error: String(error && error.message ? error.message : error) }, 502);
    }
  },
};

// CORS abierto a proposito: el dato es publico (el numero de gente en un
// Discord) y lo que se lee desde ahi no es un secreto.
function json(cuerpo, codigo) {
  return new Response(cuerpo, {
    status: codigo,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store",
    },
  });
}

// Reenviar una respuesta cacheada tal cual, cambiando solo lo que hace falta.
function cabecerasCORS(original) {
  const cabeceras = new Headers(original.headers);
  cabeceras.set("Access-Control-Allow-Origin", "*");
  return cabeceras;
}
