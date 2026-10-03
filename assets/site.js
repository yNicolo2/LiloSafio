/* LiloSafio · web
   Lee `window.LILO_DATA`, que genera `tools/build_site.py` desde config.py y
   changelog.py. Por eso el changelog de la web y el del launcher NO pueden
   quedar distintos: son el mismo dato, no dos copias escritas a mano.

   Sin framework ni build. Son 100 lineas y funcionan abiertas en disco
   (file://), sin servidor. */

(function () {
  "use strict";

  var D = window.LILO_DATA || null;

  /* ---------- texto ---------- */
  // Se usa textContent en todo lo que venga de los datos. Aunque ahora mismo
  // sea texto nuestro, costaba menos hacerlo bien que acordarse de evitarlo
  // el dia que alguien meta un <> en el changelog.
  function el(tag, clase, texto) {
    var n = document.createElement(tag);
    if (clase) n.className = clase;
    if (texto !== undefined && texto !== null) n.textContent = texto;
    return n;
  }

  function vaciar(nodo) {
    while (nodo.firstChild) nodo.removeChild(nodo.firstChild);
  }

  /* ---------- changelog ---------- */
  function pintarNotas() {
    var caja = document.querySelector("[data-notas]");
    if (!caja || !D || !D.changelog) return;
    vaciar(caja);

    D.changelog.forEach(function (entrada, indice) {
      var det = el("details", "nota");
      // La primera va abierta: quien llega desde el buscador ve los cambios
      // nuevos sin tener que pulsarlos.
      if (indice === 0) det.open = true;

      var sum = el("summary");
      sum.appendChild(el("span", "v", entrada.version));
      sum.appendChild(el("span", "t", entrada.title));
      sum.appendChild(el("span", "flecha", "▼"));
      det.appendChild(sum);

      var ul = el("ul");
      (entrada.changes || []).forEach(function (cambio) {
        ul.appendChild(el("li", null, cambio));
      });
      det.appendChild(ul);
      caja.appendChild(det);
    });
  }

  /* ---------- descargas ---------- */
  // OJO: `data-tamano` y `data-nombre` salen en MAS DE UN sitio (el resumen de
  // arriba y las tarjetas de abajo). Con `querySelector` solo se rellenaba el
  // primero y las tarjetas se quedaban con «—». Por eso va con
  // `querySelectorAll`: si el dato aparece dos veces, se pinta en las dos.
  function pintarDescargas() {
    if (!D || !D.descargas) return;
    var principal = D.descargas.principal || {};
    var respaldo = D.descargas.respaldo || {};

    // Los selectores van enteros y a mano. Antes se componian con
    // `selector + "-tamano"` y salia `[data-descarga]-tamano`, que no es un
    // selector valido: reventaba con SyntaxError y, como no habia try, se
    // caia el resto del pintado (incluido el changelog).
    var pares = [
      {
        enlace: "[data-descarga]",
        tamano: "[data-descarga-tamano]",
        nombre: "[data-descarga-nombre]",
        info: principal
      },
      {
        enlace: "[data-respaldo]",
        tamano: "[data-respaldo-tamano]",
        nombre: "[data-respaldo-nombre]",
        info: respaldo
      }
    ];

    pares.forEach(function (par) {
      var info = par.info;
      if (!info || !info.url) return;

      document.querySelectorAll(par.enlace).forEach(function (a) {
        a.setAttribute("href", info.url);
        a.hidden = false;
      });

      document.querySelectorAll(par.tamano).forEach(function (n) {
        n.textContent = info.mb ? info.mb + " MB" : "—";
      });

      document.querySelectorAll(par.nombre).forEach(function (n) {
        n.textContent = info.archivo || "—";
      });
    });

    // El resumen de la portada: tamaño + sistema en la misma linea.
    document.querySelectorAll("[data-tamano]").forEach(function (n) {
      n.textContent = principal.mb
        ? principal.mb + " MB · Windows 64 bits"
        : "—";
    });

    document.querySelectorAll("[data-nombre]").forEach(function (n) {
      n.textContent = principal.archivo || "—";
    });

    // La huella deja que el jugador compruebe que el archivo es el que
    // publicamos y que no se ha descargado a medias.
    var hash = document.querySelector("[data-hash]");
    if (hash && principal.sha256) {
      hash.textContent = "SHA-256: " + principal.sha256;
      hash.title = "Comprueba que el archivo que te has bajado es este y no esta a medias";
    }
  }

  /* ---------- entrar al hacer scroll ----------
     Cada bloque marcado con `data-revelar` sale de abajo cuando aparece. Sin
     esto la pagina aparece entera de golpe y no se nota el recorrido.

     Dos detalles que importan:
       * `prefers-reduced-motion` -> no se anima nada. En ese caso se marca todo
         como visible y listo, que es lo mismo que ver la web quieta.
       * Sin `IntersectionObserver` (navegador muy viejo) se hace lo mismo:
         contenido primero, animacion despues. */
  function activarRevelado() {
    var bloques = document.querySelectorAll("[data-revelar]");
    if (!bloques.length) return;

    var quieto = window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (!("IntersectionObserver" in window) || quieto) {
      bloques.forEach(function (n) { n.classList.add("visible"); });
      return;
    }

    var observador = new IntersectionObserver(function (entradas) {
      entradas.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add("visible");
        observador.unobserve(e.target);
      });
    }, { rootMargin: "0px 0px -12% 0px", threshold: 0.12 });

    bloques.forEach(function (n) { observador.observe(n); });
  }

  /* ---------- cabecera ---------- */
  function pintarCabecera() {
    if (!D) return;
    document.querySelectorAll("[data-version]").forEach(function (n) {
      n.textContent = "v" + D.app.version;
    });
  }

  /* ---------- datos del propietario ---------- */
  // El aviso legal y el pie repiten el nombre del owner en varios sitios. Van
  // como `data-owner` para que cambiarlo en `site.config.json` lo cambie en
  // todos a la vez: un aviso legal con dos nombres distintos es peor que no
  // tener ninguno. El contacto es solo el Discord, asi que no hay email que
  // mantener ni que se quede sin rellenar.
  function pintarPropietario() {
    if (!D || !D.owner) return;
    var nombre = D.owner.nombre || "";
    var rol = D.owner.rol || "";

    document.querySelectorAll("[data-owner], [data-owner-nombre]").forEach(function (n) {
      n.textContent = nombre;
    });
    document.querySelectorAll("[data-owner-rol]").forEach(function (n) {
      n.textContent = rol;
    });

    // La cara de la piel de Minecraft va en el pie. Se genera con el mismo
    // render que usa el launcher, asi que es de verdad la misma.
    var cara = document.querySelector("[data-owner-piel]");
    if (cara && D.owner.piel) cara.setAttribute("src", D.owner.piel);

    var fecha = document.querySelector("[data-legal-fecha]");
    if (fecha && D.generado) fecha.textContent = D.generado;
  }

  /* ---------- estado del servidor ---------- */
  // Las cifras las trae `build_site.py` de la invitación pública de Discord y
  // llegan ya escritas en el HTML. Si el build no pudo leerlas, `ok` sale en
  // false y aquí NO se pinta nada: es mejor no mostrar un contador que mentir
  // con un «0 en línea» cuando lo que no funciona es la conexión.
  function pintarServidor() {
    var caja = document.querySelector("[data-servidor]");
    if (!caja || !D || !D.servidor || !D.servidor.ok) return;

    var s = D.servidor;
    var linea = document.querySelector("[data-servidor-linea]");
    if (linea) {
      linea.textContent = s.en_linea + " en línea";
    }

    var enlace = document.querySelector("[data-servidor-enlace]");
    if (enlace) {
      if (D.owner && D.owner.discord) enlace.setAttribute("href", D.owner.discord);
      // La cifra viene de un sitio externo: se deja claro de dónde sale.
      var total = el("span", "servidor-total", " · ~" + s.miembros + " miembros");
      if (linea) linea.parentNode.appendChild(total);
      enlace.setAttribute(
        "aria-label",
        "Entrar al Discord de " + s.nombre + " (" + s.en_linea + " en línea)"
      );
    }

    // `hidden` en el HTML a proposito: sin esto, en una pagina abierta en
    // disco sin `site-data.js` se veria «…» colgando donde deberia ir la luz.
    caja.hidden = false;
  }

  /* ---------- estado del servidor, en vivo ---------- */
  // Lo de arriba es una foto: la cifra del momento en que se genero la web. Se
  // puede refrescar sola, pero Discord NO manda cabeceras `Access-Control-Allow-Origin`
  // en su API, asi que el navegador bloquea un `fetch()` directo ahi. Por eso hace
  // falta un intermediario.
  //
  // AVISO: el intermediario ve la IP de quien visita. Es el precio de que esto
  // sea gratis sin montar nada. Quien no lo quiera, quita la llamada de
  // `arrancar()` y se queda con la foto del build (que ya funciona).
  //
  // Van en lista y se prueban por orden porque estos servicios se caen mucho:
  // medidos el mismo dia, `allorigins` contestaba con datos unas horas y luego
  // daba 500/522 seis veces seguidas. Si el primero esta caido, el siguiente
  // hace el trabajo. Si estan todos caidos, se queda la foto y no se nota.
  var PROXIES = [
    "https://api.allorigins.win/get?url=",
    "https://api.codetabs.com/v1/proxy/?quest=",
    "https://corsproxy.io/?url="
  ];
  var CACHE_KEY = "lilosafio:discord";
  var CACHE_MS = 5 * 60 * 1000;
  // Por intento. Con tres intentos y este tope, lo peor que tarda son ~12 s
  // siempre a la sombra: el numero ya esta puesto desde el principio.
  var TIMEOUT_MS = 4000;

  function leerCache() {
    try {
      var bruto = sessionStorage.getItem(CACHE_KEY);
      if (!bruto) return null;
      var guardado = JSON.parse(bruto);
      if (!guardado || Date.now() - guardado.t > CACHE_MS) return null;
      return guardado.d;
    } catch (e) {
      // Sin sessionStorage (modo privado raro, o abierto con `file://`) ya esta:
      // solo se pierde la comodidad de no repetir la peticion.
      return null;
    }
  }

  function guardarCache(d) {
    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), d: d }));
    } catch (e) {
      /* da igual: solo es una comodidad */
    }
  }

  // Se pinta encima de la foto solo si lo que llega tiene sentido. Un contador
  // que en un fallo se deja a «0» seria peor que no refrescar nunca.
  function aplicarServidor(d) {
    if (!d || typeof d.en_linea !== "number" || typeof d.miembros !== "number") return;
    var linea = document.querySelector("[data-servidor-linea]");
    if (linea) linea.textContent = d.en_linea + " en línea";
    var total = document.querySelector(".servidor-total");
    if (total) total.textContent = " · ~" + d.miembros + " miembros";
    var enlace = document.querySelector("[data-servidor-enlace]");
    if (enlace) {
      enlace.setAttribute(
        "aria-label",
        "Entrar al Discord de " + (d.nombre || "LiloSafio") + " (" + d.en_linea + " en línea)"
      );
    }
  }

  function refrescarServidor() {
    var s = D && D.servidor;
    // Sin foto previa no hay nada que refrescar: ademas, sin internet en el
    // build, la web no deberia quedarse independientemente con la foto vieja.
    if (!s || !s.ok || !s.invitacion) return;

    var deCache = leerCache();
    if (deCache) {
      aplicarServidor(deCache);
      return;
    }

    var destino =
      "https://discord.com/api/v10/invites/" +
      encodeURIComponent(s.invitacion) +
      "?with_counts=true";

    // Todo esto es opcional por definicion: si falla, la foto que ya hay se
    // queda sola y el visitante no se entera. Por eso va sin catch de UI.
    var i = 0;

    function intentar() {
      if (i >= PROXIES.length) return; // todos caidos: se queda la foto
      var proxy = PROXIES[i++];

      var control = typeof AbortController !== "undefined" ? new AbortController() : null;
      var reloj = setTimeout(function () {
        if (control) control.abort();
      }, TIMEOUT_MS);

      fetch(proxy + encodeURIComponent(destino), {
        signal: control ? control.signal : undefined
      })
        .then(function (r) {
          return r.ok ? r.json() : null;
        })
        .then(function (envoltorio) {
          if (!envoltorio) throw new Error("sin datos");
          var crudo = envoltorio && envoltorio.contents;
          // Este proxy responde con el cuerpo de Discord dentro de un JSON.
          if (typeof crudo !== "string") throw new Error("no es el proxy bueno");
          var d = JSON.parse(crudo);
          if (!d || !d.guild || d.guild.id === undefined) throw new Error("no es Discord");
          var fresco = {
            en_linea: d.approximate_presence_count,
            miembros: d.approximate_member_count,
            nombre: d.guild.name
          };
          aplicarServidor(fresco);
          guardarCache(fresco);
        })
        .catch(function () {
          // Este no ha sido. Se limpia el reloj y se pasa al siguiente: los
          // servicios libres se caen a menudo y el siguiente puedeResponder.
          clearTimeout(reloj);
          intentar();
        })
        .then(function () {
          clearTimeout(reloj);
        });
    }

    intentar();
  }

  function arrancar() {
    document.documentElement.classList.remove("sin-js");
    pintarCabecera();
    pintarPropietario();
    pintarDescargas();
    pintarNotas();
    pintarServidor();
    refrescarServidor();
    activarRevelado();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", arrancar);
  } else {
    arrancar();
  }
})();