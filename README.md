# Colectivos Jujuy en vivo

Dónde está cada colectivo de San Salvador de Jujuy ahora, cuánto falta para que llegue a tu parada y qué línea tomar para llegar a un lugar. Sin cuenta.

Hecho por Franco Duran, fundador de la comunidad [jujuy.dev](https://jujuy.dev.ar). En línea: [colejuy.vercel.app](https://colejuy.vercel.app).

Este repositorio es la copia pública del proyecto: el código, la documentación y el relato de cómo se hizo. No contiene claves, tokens ni sesiones; todo lo secreto se configura con variables de entorno y acá solo figuran sus nombres.

## Qué construimos

- **Mapa en vivo sin cuenta.** Los coches de Santa Ana en servicio, moviéndose sobre su recorrido entre una lectura y la siguiente, con una flecha que dice hacia dónde van. Un coche sin señal queda atenuado donde reportó por última vez.
- **Líneas.** Las 54 de la ciudad: 39 con seguimiento y 15 solo con recorrido. Cada sentido dice de qué parada sale y en cuál termina; las paradas se abren a pedido.
- **Cuánto falta.** En cada parada, qué coches vienen y en cuántos minutos, marcado como estimación.
- **Cómo llegar.** De un punto a otro por dirección o tocando el mapa: viajes directos o con un cambio de colectivo, con dónde subir, dónde cambiar, dónde bajar y cuánto se camina.
- **Avisos por Telegram.** Desde la línea, desde una parada o escribiéndole al bot. El aviso dice a qué distancia está el coche y un rango de minutos.
- **Tus líneas.** Se guardan con una estrella en el propio celular, sin registro.
- **Para buscadores y asistentes.** Una página por línea, un índice, preguntas frecuentes y `llms.txt`.

El detalle, función por función, está en [docs/scope.md](docs/scope.md).

## Cómo trabajamos

Una persona dirige y decide; agentes de IA investigan, construyen y miden. Nada se da por terminado sin haberlo medido. El método sale de [kero-stack](https://github.com/uxKero/kero-stack), un conjunto de skills abiertas para agentes.

**1. Diagnóstico antes que diseño.** Primero se midió lo que existía: qué devuelve la fuente, cuánto pesa, qué falta. De ahí salió la tesis del producto: la posición de cada coche ya era un dato disponible, pero la app oficial ponía un inicio de sesión entre la persona y su parada. Está en [docs/research.md](docs/research.md), con sus fuentes y sus supuestos.

**2. Alcance en una sola lista.** Qué hace el producto, y qué no hace y por qué. Cada cambio de rumbo de quien dirige quedó escrito ahí.

**3. El sistema visual es una skill, no un documento suelto.** En el proyecto vive como una skill que los agentes cargan solos al tocar una pantalla; acá está publicada como [docs/sistema-visual.md](docs/sistema-visual.md): reglas con su razón, lo que quien dirige rechazó a la vista, y las trampas ya pagadas para que nadie las pague dos veces.

**4. Varios agentes, cuando conviene.** El trabajo principal lo hizo un agente de IA. Para lo que se podía separar se usaron subagentes (uno escribió las pruebas del cálculo de tiempos, otro hizo una revisión independiente sin conocer las conclusiones del primero) y agentes de Cursor en ramas propias, integrados por pull request. La regla fue no confiar en el resumen de ningún agente: se lee el cambio y se corre la comprobación.

**5. Medir antes de afirmar.** Algunos ejemplos de lo que cambió por haber medido:

- Una revisión independiente encontró que en 13 de las 38 líneas de ida y vuelta la fuente no manda la ida primero, así que el tiempo de llegada se calculaba con los coches del sentido contrario.
- El número de orden de las paradas viene incompleto y, en tres líneas, al revés. Antes de ordenar por el trazado se lo contrastó con el rumbo de los coches: 37 en movimiento iban a favor y ninguno en contra.
- La velocidad real sobre el recorrido, contando paradas, tiene mediana de 18,7 km/h, pero una cuarta parte de los coches va a menos de 14,7. Simulando 257 avisos de "5 minutos", el coche llegó entre 3 y 6 minutos en el 51% de los casos. Por eso el aviso dejó de prometer un minuto exacto.
- Una mejora que parecía obvia (estimar con el ritmo reciente de cada coche) se probó con datos, no redujo el error y se descartó.
- Las pantallas principales se miden con una auditoría automática en un navegador real: contraste sobre el color pintado, foco por teclado, tamaño de los controles y del texto. No todas las vistas pasaron por ella, y la skill del proyecto dice cuáles no.

**6. Los errores también se anotan.** Dos fallas llegaron a producción y se corrigieron el mismo día: un enlace del bot que respondía "ese paso ya venció" y una regla de estilos partida por la mitad. Las dos están descritas en la skill del proyecto, con la causa y con la comprobación que las habría evitado: mirar la pantalla y simular el mensaje real, no quedarse con que las pruebas pasan.

La caja de feedback está documentada en [docs/feedback-security.md](docs/feedback-security.md). Usa un BFF same-origin, Cloudflare Turnstile gratuito, rate limit de 5 envíos por IP por hora y un límite global de 40 por hora antes de entregar el mensaje al bot.

**7. Sin modelo de IA en producción.** El sitio y el bot no llaman a ningún modelo. El bot entiende "avisame cuando pase el 41" con reglas escritas a mano: no cuesta por mensaje y responde siempre igual.

## Fuente en vivo (falta completar)

Este repositorio no incluye la conexión con los servidores de Santa Ana. Sin ella el mapa muestra recorridos y paradas, sin coches. Cómo enchufarla y el formato de `/api/fleet`: [CONTRIBUTING.md](CONTRIBUTING.md).

## Cómo se usa

[Video de 94 segundos en el celular](docs/colejuy-demo.mp4): buscar una línea, ver cuánto falta en una parada, guardar líneas, plegar el panel, ver tu ubicación y armar un viaje con cambio de colectivo.

## Que me avisen

Desde el mapa: se busca la línea, se toca la parada y “Avisarme por Telegram”. El bot escribe cuando el colectivo está a 3, 5 o 10 minutos. Cada aviso suena una vez y, si en 90 minutos no viene nadie, se cancela.

También se le puede pedir directo al bot: `avisame cuando pase el 41`, `decime cuando pase el 10` o `/avisame 41 5`. Pide la ubicación (un botón para compartirla, o una dirección), elige la parada de esa línea más cercana y confirma con el nombre de la parada, cuánto hay que caminar y, si se sabe, en cuánto pasa el próximo. Si los dos sentidos quedan cerca, pregunta hacia dónde; si solo uno tiene un colectivo en camino, elige ese.

`/casa`, después de compartir la ubicación, la guarda 90 días: la próxima vez no hace falta enviarla. `/avisos` lista los pendientes y `/cancelar` los borra.

El Urbano y la línea 26 no tienen posición en vivo. El bot lo dice y no arma un aviso.

## Correrlo

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # pruebas de distancias, tiempos, combinaciones, avisos y colores
npm run build
```

`npm run sync:muni` vuelve a copiar los recorridos municipales de las líneas sin seguimiento a `src/data/muni-lines.json`.

## Subirlo a Vercel

Sin ninguna variable el sitio muestra las líneas, los recorridos y las paradas. Las de `.env.example` hacen falta para las posiciones en vivo, para los avisos por Telegram y, si se quiere ver el detalle de las visitas, para Google Analytics. Ese archivo trae solo los nombres y para qué sirve cada una; los valores los pone cada quien en su despliegue y nunca van al repositorio.

1. Importar el repositorio en Vercel (o `npx vercel` desde esta carpeta). La región es São Paulo (`vercel.json`).
2. Para las posiciones en vivo hay que completar la fuente de datos: este repositorio no incluye la conexión con Santa Ana. Ver [CONTRIBUTING.md](CONTRIBUTING.md) (`FLEET_MOCK=1` muestra coches ficticios).
3. Para los avisos por Telegram:
   - Crear el bot con [@BotFather](https://t.me/BotFather) y copiar el token y el nombre de usuario.
   - Agregar una base Upstash Redis desde Vercel (Storage → Upstash). Deja cargadas `KV_REST_API_URL` y `KV_REST_API_TOKEN`.
   - Cargar en Vercel `TELEGRAM_BOT_TOKEN`, `NEXT_PUBLIC_TELEGRAM_BOT`, `TELEGRAM_WEBHOOK_SECRET`, `TICK_SECRET` y `NEXT_PUBLIC_SITE_URL`, y volver a desplegar.
   - Correr una vez `node scripts/telegram-setup.mjs` con esas variables, para que Telegram llame al sitio y queden registrados los comandos (`/avisame`, `/avisos`, `/casa`, `/cancelar`).
   - Programar una llamada por minuto a `https://<sitio>/api/telegram/tick?key=<TICK_SECRET>`. El plan gratuito de Vercel solo permite tareas una vez al día, así que hace falta un programador externo (por ejemplo cron-job.org) o el plan Pro.
4. Para ver las visitas en Google Analytics 4, opcional: crear una propiedad web, copiar el id de medición (`G-…`) a `NEXT_PUBLIC_GA_ID` y volver a desplegar. Sin esa variable el script de Google no entra en la página.

## Privacidad

No hay cuenta: el mapa se abre sin registro. Si el despliegue tiene `NEXT_PUBLIC_GA_ID`, Google Analytics 4 se carga después de que la página ya se puede usar y anota las visitas, la línea elegida, la parada abierta, el viaje elegido y el toque en “Avisarme por Telegram”. Esos eventos llevan el id de la línea y, si corresponde, el de la parada. No se manda la ubicación, la dirección escrita ni el chat de Telegram. Sin esa variable, Google no se carga. Las visitas también las cuenta Vercel, sin cookies, en el proyecto.

## De dónde salen los datos

- Posiciones, recorridos y paradas: el servicio de Santa Ana SRL, a través de `/api/fleet` y `/api/lines`. El navegador nunca habla con Santa Ana: lo hace el servidor, y una copia en el CDN de pocos segundos hace que a la fuente le llegue como mucho un pedido por ventana, haya diez personas mirando o diez mil.
- Recorridos de las líneas sin seguimiento: GeoServer de la Municipalidad de San Salvador de Jujuy.
- Mapa: OpenFreeMap y OpenStreetMap. Búsqueda de direcciones: Nominatim.

Solo hay posición en vivo de Santa Ana. El Urbano y la línea 26 no publican la suya; de esas líneas se muestra el recorrido.

Este proyecto no es de Santa Ana ni de la Municipalidad, y no tiene relación con ellas.

## Licencia

Todavía no tiene una licencia definida.
