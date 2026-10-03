# Bot de LiloSafio

Reglas, sorteos y los avisos de quién entra al juego.

## Antes que nada: el token

El token **nunca** va en el código. Va en `.env`, que está en `.gitignore`.

Un token de bot da control completo sobre tu bot: puede escribir en tus canales,
leerlos, y usarlo en otros servidores. Si alguna vez se sube a un repositorio, a
una captura o a un chat, **hay que cambiarlo** (Reset Token) e invalidar el
antiguo en el mismo momento. No es una precau: si alguien más lo tiene, puede
usarlo hasta que lo invalides.

## Montarlo

```powershell
npm install
Copy-Item .env.example .env    # y rellenarlo
npm run comprobar              # dice que falta y por qué
npm start
```

### Qué va en el `.env`

| Variable | Qué es |
|---|---|
| `DISCORD_TOKEN` | El token (Reset Token en el Developer Portal) |
| `DISCORD_CLIENT_ID` | El número de la URL de la página del bot |
| `DISCORD_GUILD_ID` | Developer Portal → General Information |
| `DISCORD_CANAL_AVISOS` | Opcional. El canal donde se anotan las entradas |
| `DISCORD_ROL_AVISOS` | Opcional. Si lo pones, solo se avisa de ese rol |

## Permisos del bot

Lo justos en el canal de avisos: **View Channel**, **Send Messages**,
**Embed Links**. Nada de banear ni administrar. Si se puede expulsar gente, sobra
y sobra el riesgo.

### Activar Server Members Intent

**Developer Portal → tu bot → Bot → Privileged Gateway Intents →
Server Members Intent → ON.**

Sin esto el bot ve el servidor y ve **0 miembros**, y es justamente lo que
comprueba que quien entra al juego está de verdad dentro y no solo dice que lo
está. `npm run comprobar` te avisa si falta.

## Que el bot esté siempre encendido

Un bot de Discord se conecta por un **WebSocket** y se queda escuchando. Eso
exige un **proceso vivo**: si no hay nadie ejecutando `npm start`, el bot está
apagado. No hay forma de evitarlo desde el código.

**Cloudflare Workers no sirve para esto.** Un Worker es una función que contesta
peticiones HTTP y se apaga cuando no hay nadie; una conexión WebSocket abierta no
es una petición HTTP, así que no cabe ahí. Por eso los avisos de quién entra los
manda un Worker (`site/worker/discord-log.js`, que solo hace POST a Discord) y
este bot lleva las reglas y los sorteos.

### La opción: un servidor propio, gratis y siempre encendido

El nivel gratuito de **Oracle Cloud** da 2 OCPU y 12 GB de RAM, gratis para
siempre, sin apagado y sin tarjeta después de registrarse. Es un VPS normal, así
que el bot se queda ahí sin depender de tu PC.

**Pasos, una vez:**

1. Entra en <https://cloud.oracle.com/free> y crea la cuenta (pide tarjeta, pero
   no cobra nada mientras no pases de los límites gratuitos).
2. Cuando tengas la cuenta, abre **Cloud Shell**: es un botón dentro de la propia
   web de Oracle, una terminal ya lista. No hay que instalar nada ni configurar
   SSH.
3. Pega esto, tal cual, en esa terminal:

```bash
curl -fsSL https://raw.githubusercontent.com/yNicolo2/LiloSafio/main/bot/instalar.sh | bash
```

4. Te pedirá el token (no se ve mientras lo escribes) y el ID del canal. Ya está
   puesto de serie; si lo dejas vacío, el bot funciona igual y simplemente no
   avisa de las entradas.

Eso es todo. El script instala Node si falta, baja el bot, crea el servicio de
systemd con reinicio automático y lo arranca. A partir de ahí **el bot está
encendido siempre y solo, sin tu PC**, y si se cae, vuelve solo.

### Comprobarlo

```bash
systemctl status lilosafio-bot     # si dice "active (running)", esta bien
journalctl -u lilosafio-bot -f    # ver lo que dice en tiempo real
```

### Si un dia hay que tocarlo

```bash
nano /opt/lilosafio-bot/.env      # cambiar el token
systemctl restart lilosafio-bot   # aplicarlo
```

### Por qué un VPS y no un hosting de bots gratis

Hay sitios que alojan bots gratis a cambio del token. **No los uses**: te piden
tu token de Discord, y quien lo tiene escribe en tu canal y usa tu bot. Un VPS
gratuito donde el token solo lo lee tu servicio es otra cosa.

## Los sorteos no se pierden


El script anterior los guardaba en un `Map` en memoria. Eso se pierde en cuanto el
proceso se reiniciaba —y el proceso se reinicia cada vez que se apaga el
servidor, se cae la conexión o se actualiza— y los botones de participar se
quedaban sin nada detrás, diciendo que el sorteo había expirado sin haber
expirado.

Ahora se guardan en `sorteos.json` (o en lo que digas en
`DISCORD_ARCHIVO_SORTEOS`) en cuanto cambia algo.
## Comandos

| Comando | Qué hace |
|---|---|
| `/rulesdiscord` | Reglamento del Discord |
| `/ruleserver` | Reglamento del servidor de Minecraft |
| `/giveaways` | Abre el formulario de un sorteo |
| `/avisos` | Dice en qué canal se anotan las entradas |
