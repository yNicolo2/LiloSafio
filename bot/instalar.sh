#!/usr/bin/env bash
#
# Instala el bot de LiloSafio en un servidor y lo deja siempre encendido.
#
#   curl -fsSL https://raw.githubusercontent.com/yNicolo2/LiloSafio/main/bot/instalar.sh | bash
#
# QUE HACE
# --------
#   1. Instala Node si no esta.
#   2. Baja el bot.
#   3. Crea el servicio de systemd con reinicio automatico.
#   4. Lo arranca y te dice si ha conectado.
#
# QUE NECESITAS
# -------------
# Un servidor Linux que este encendido. Este script no apaga nada ni necesita tu
# PC: corre en el servidor y ahi se queda.
#
#   - El nivel gratuito de Oracle Cloud (2 OCPU / 12 GB, gratis para siempre):
#     https://cloud.oracle.com/free  ->  Crear cuenta  ->  Abrir "Cloud Shell"
#     (es una terminal que ya esta dentro de la web, sin instalar nada)
#   - O cualquier VPS de pago.
#
# TOKEN
# -----
# Lo pide aqui y lo guarda en `/opt/lilosafio-bot/.env`, que solo lee root.
# No se escribe en ningun log ni en ninguna pagina.
#
# QUE PASA SI SE CAE
# -------------------
# systemd lo vuelve a levantar solo en cuanto se cae, y si no puede, espera cada
# vez mas entre reintentos. En cuanto el proceso vuelve, el bot vuelve a estar
# online sin que nadie toque nada.
#
set -euo pipefail

RAIZ="https://raw.githubusercontent.com/yNicolo2/LiloSafio/main/bot"
DIR="/opt/lilosafio-bot"
SERVICE="lilosafio-bot"

verde()  { printf '\033[32m%s\033[0m\n' "$*"; }
amarillo(){ printf '\033[33m%s\033[0m\n' "$*"; }
rojo()   { printf '\033[31m%s\033[0m\n' "$*"; }
info()   { printf '  %s\n' "$*"; }

echo
verde "Instalador del bot de LiloSafio"
echo

# --- 1. Node --------------------------------------------------------------
# Ubuntu 22.04 y 24.04 traen una version antigua de Node que no sirve. Se anade
# el repositorio oficial de NodeSource y se instala la LTS. Si ya hay una Node
# 20 o mas nueva, no se toca: reinstalarla en un servidor que ya funciona es
# como romperse algo por preventable.
necesita_node=1
if command -v node >/dev/null 2>&1; then
  mayor="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
  if [ "$mayor" -ge 20 ]; then
    verde "Node ya instalado (v$(node -v))"
    necesita_node=0
  fi
fi

if [ "$necesita_node" -eq 1 ]; then
  info "Instalando Node 22…"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq curl ca-certificates gnupg >/dev/null
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null 2>&1
  apt-get install -y -qq nodejs >/dev/null
  verde "Node $(node -v) instalado"
fi

# --- 2. El bot ------------------------------------------------------------
info "Descargando el bot…"
mkdir -p "$DIR/src"
curl -fsSL "$RAIZ/package.json"        -o "$DIR/package.json"
curl -fsSL "$RAIZ/src/config.js"       -o "$DIR/src/config.js"
curl -fsSL "$RAIZ/src/reglas.js"       -o "$DIR/src/reglas.js"
curl -fsSL "$RAIZ/src/sorteos.js"      -o "$DIR/src/sorteos.js"
curl -fsSL "$RAIZ/src/index.js"        -o "$DIR/src/index.js"
curl -fsSL "$RAIZ/src/comprobar.js"    -o "$DIR/src/comprobar.js"
chmod 600 "$DIR"/src/*.js
info "Descargado en $DIR"

# --- 3. El token ----------------------------------------------------------
# Se pregunta aqui y no se pasa por linea de comandos: lo que se pasa por linea
# de comandos se queda en el historial de la shell y en el `ps` de todo el mundo.
echo
amarillo "Necesito el token del bot."
info "Si no lo tienes: Discord -> Developers -> Applications -> LiloSafio -> Reset Token"
echo -n "  Token (no se muestra): "
read -rs TOKEN
echo
echo

if [ -z "${TOKEN:-}" ]; then
  rojo "Falta el token. No se puede continuar."
  exit 1
fi

# El canal de avisos. Si lo dejan vacio, el bot funciona igual pero no avisa de
# quien entra al juego.
echo -n "  ID del canal de avisos (vacio si no hay): "
read -r CANAL || CANAL=""
echo

GUILD="${GUILD:-1554564740985000007}"
CLIENT="${CLIENT:-1554662437247123506}"

umask 077
cat > "$DIR/.env" <<FINAL
DISCORD_TOKEN=$TOKEN
DISCORD_CLIENT_ID=$CLIENT
DISCORD_GUILD_ID=$GUILD
DISCORD_CANAL_AVISOS=$CANAL
FINAL
chmod 600 "$DIR/.env"
info ".env escrito (solo root lo puede leer)"

# --- 4. Dependencias ------------------------------------------------------
info "Instalando dependencias…"
cd "$DIR"
npm install --omit=dev --silent >/dev/null 2>&1
verde "Dependencias instaladas"

# --- 5. Servicio ----------------------------------------------------------
# `Restart=always` es lo que hace que el bot vuelva solo. `RestartSec=10` evita
# que se reinicie en bucle si el token esta mal: con eso el proceso se para y
# dice por que en vez de ficar reiniciandose sin descanso.
info "Creando el servicio…"
cat > "/etc/systemd/system/$SERVICE.service" <<FINAL
[Unit]
Description=Bot de Discord de LiloSafio
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$DIR
EnvironmentFile=$DIR/.env
ExecStart=/usr/bin/node $DIR/src/index.js
Restart=always
RestartSec=10
# Que un bot que se equivoca no se lleve por delante el servidor.
MemoryMax=512M
Nice=5

# Endurecimiento. El bot no necesita nada de esto.

# --- 6. Comprobar ---------------------------------------------------------
# Diez segundos de margen para que de tiempo a conectar con Discord antes de
# mirar el log: si se mira enseguida sale a medias y parece que ha fallado.
echo
info "Esperando a que conecte…"
sleep 12
echo
echo "  Últimas líneas del registro:"
journalctl -u "$SERVICE" -n 15 --no-pager 2>/dev/null | sed 's/^/    /'
echo

if systemctl is-active --quiet "$SERVICE"; then
  verde "LISTO · el bot esta corriendo y se levanta solo si se cae"
  echo
  info "Ver si sigue vivo:   systemctl status $SERVICE"
  info "Ver el registro:     journalctl -u $SERVICE -f"
  info "Pararlo:             systemctl stop $SERVICE"
  info "Cambiar el token:    nano $DIR/.env  y luego  systemctl restart $SERVICE"
  echo
else
  rojo "El servicio no esta corriendo. El registro de arriba dice por que."
  info "Lo mas comun: token equivocado. Cambialo con Reset Token y ponlo en $DIR/.env"
  exit 1
fi

NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$DIR

StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
FINAL

systemctl daemon-reload
systemctl enable "$SERVICE" >/dev/null 2>&1
systemctl restart "$SERVICE"
echo
verde "Servicio instalado y arrancado"
