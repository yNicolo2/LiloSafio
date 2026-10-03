"use strict";

/**
 * Sorteos, con los participantes guardados en DISCO.
 *
 * El bot que tenias antes los guardaba en un `Map` en memoria. Eso funciona
 * hasta que el proceso se reinicia, y un proceso que se reinicia cada vez que se
 * apaga el servidor, se cae la conexion o se actualiza, pierde TODOS los
 * sorteos: los botones de participate se quedan sin nada detras y el sorteo
 * aparece como expirado sin haber expirado.
 *
 * Aqui se guardan en un JSON. Sigue siendo un archivo y se puede editar a mano,
 * que para un bot con un puñado de sorteos esta bien y no merece la pena meter
 * una base de datos.
 */

const fs = require("fs");
const path = require("path");

/** Los sorteos: id del mensaje -> datos. */
let sorteos = {};

/** Lee del disco. Un JSON roto no debe tumbar el bot al arrancar. */
function cargar(archivo) {
  try {
    sorteos = JSON.parse(fs.readFileSync(archivo, "utf-8"));
  } catch (error) {
    if (error.code !== "ENOENT") {
      // Esta mal escrito. No se borra a ojo: si se perdia, perdia sorteos.
      const copia = `${archivo}.roto`;
      try {
        fs.copyFileSync(archivo, copia);
        console.error(`sorteos · ${archivo} estaba corrupto; copia en ${copia}`);
      } catch {
        console.error(`sorteos · ${archivo} estaba corrupto y no se pudo copiar`);
      }
    }
    sorteos = {};
  }
  return sorteos;
}

/** Escribe en disco. Escribir en cada cambio es poco y asi no se pierde nada. */
function guardar(archivo) {
  try {
    fs.mkdirSync(path.dirname(archivo), { recursive: true });
    fs.writeFileSync(archivo, JSON.stringify(sorteos, null, 2), "utf-8");
  } catch (error) {
    console.error(`sorteos · no se pudo guardar: ${error.message}`);
  }
}

/** El sorteo de un mensaje, o `null` si ya no esta. */
function obtener(idMensaje) {
  return sorteos[idMensaje] || null;
}

/** Crea uno y lo guarda. */
function crear(archivo, idMensaje, datos) {
  sorteos[idMensaje] = { ...datos, participantes: [] };
  guardar(archivo);
  return sorteos[idMensaje];
}

/**
 * Apunta o desapunta a alguien. Devuelve si dentro ha quedado.
 *
 * Se guarda en cuanto cambia, no al cerrar: si el bot se cae entre medias, el
 * boton ya no mente sobre quien participa.
 */
function participar(archivo, idMensaje, idUsuario) {
  const sorteo = sorteos[idMensaje];
  if (!sorteo) return null;
  const dentro = sorteo.participantes.includes(idUsuario);
  if (dentro) {
    sorteo.participantes = sorteo.participantes.filter((u) => u !== idUsuario);
  } else {
    sorteo.participantes.push(idUsuario);
  }
  guardar(archivo);
  return { dentro, total: sorteo.participantes.length };
}

module.exports = { cargar, guardar, obtener, crear, participar };
