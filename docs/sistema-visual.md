---
name: coelctivo-design
description: Sistema visual de Colectivos Jujuy en vivo. Úsalo al tocar cualquier pantalla, componente o token de este proyecto, al elegir color, tipografía, espaciado, radios, íconos, movimiento, foco o estados, al escribir textos de la interfaz, y antes de decir que una pantalla está terminada.
---

# Colectivos Jujuy — sistema visual

Este archivo manda sobre el código. Si una pantalla lo contradice, se corrige la pantalla. Los valores viven en `src/app/globals.css`; aquí están las reglas y sus razones.

Ninguna referencia visual fue dada por quien dirige el proyecto. La dirección actual es una propuesta del agente y todo lo de la sección 14 sigue abierto.

## 1. Qué es en pantalla

Una sola vista: el mapa y, debajo, un panel. La usa alguien parado en una parada, con el celular en una mano, a pleno sol o de noche, con datos móviles. Tiene que responder "cuánto falta" en un toque.

- Sin línea elegida: el estado, "Buscar línea", las líneas guardadas, "Cómo llegar", "Ver todos" y el crédito. El mapa no muestra coches, salvo los de las líneas guardadas.
- Páginas de lectura (`/linea/[id]`, `/lineas`, `/acerca`): documentos simples, no el mapa. Existen para que buscadores y asistentes lean el contenido. **La app no las enlaza**: se llega por el buscador, por `sitemap.xml` y por `llms.txt`. Ellas sí enlazan al mapa.
- Cómo llegar: salida y destino (por dirección o tocando el mapa) y, debajo, las opciones. Cada opción es una chapa con dónde subir, dónde bajar y el tiempo. El mapa queda sin coches; la salida es un anillo y el destino un punto lleno.
- Con línea: su recorrido y solo sus coches. En el panel, el tab Ida / Vuelta; debajo, en palabras, de qué parada sale y en cuál termina ese sentido ("Desde A hasta B"); y dos botones a la par, "Ver paradas" y "Avisarme". Las paradas se listan, y se marcan en el mapa, recién al tocar "Ver paradas".
- Con parada: los coches que vienen, dentro de la misma fila de la parada.
- Elegir línea: un diálogo a pantalla completa en celular.

## 2. La marca

**El isologo**: una "c" dibujada como un recorrido, con el colectivo como punto naranja (`#ef7d4f`) en la punta, sobre tinta, y al lado el nombre "colejuy" en Barlow 700 minúscula. Vive en `src/components/Logo.tsx` y `src/app/icon.svg`; los PNG de `public/` se generan de ahí. Aparece en el panel de inicio y como ícono de la app. Ese naranja es solo del isologo.

**La chapa**: el número de la línea sobre el color de la línea, como el cartel del frente del colectivo. Es el único elemento con color fuerte. Aparece en el panel, en el buscador de líneas y como marcador en el mapa. No se usa para nada que no sea una línea.

## 3. Color

- Roles, nunca valores sueltos: `--ground` (fondo y controles en reposo), `--surface` (panel), `--ink` (texto y acción principal), `--ink-soft` (texto secundario), `--rule`, `--warn` (aviso, siempre con texto).
- El color de una línea nunca se usa como viene del dato. `tone()` en `src/lib/color.ts` conserva el matiz de cada línea y fija para todas la misma luminosidad y una saturación viva (OKLCH, L 0,70 y C 0,15): alegre y parejo. Las líneas sin color usan `INK`.
- El texto sobre un tono de línea es oscuro en todas y está medido: 4,5:1 o más en las 39 líneas (`color.test.ts`).
- El azul `#2b63d9` con halo es solo para la ubicación de la persona. Ningún punto marcado, parada o coche lo usa.
- El resto de la interfaz es neutro para que las chapas sean lo único que compite por la vista.

## 4. Tipografía y números

- Barlow, pesos 400 a 700. Viene de la señalización vial, que es donde vive un número de colectivo.
- `font-variant-numeric: tabular-nums` en todo el cuerpo: los minutos no bailan al actualizarse.
- Texto de lectura desde 14px; el cuerpo es 16px. El tiempo de llegada es el dato más grande del panel (24px, 700).

## 5. Espacio, forma y profundidad

- Una escala de espaciado: 4, 8, 12, 16, 24, 32 (`--s1` a `--s6`). Nada fuera de ella.
- Radios concéntricos: el panel tiene 24 y un margen interior de 16, así que lo de adentro tiene 8. Dentro del control segmentado, 8 menos 4.
- Una sola sombra en todo el producto: la del botón de ubicación, porque flota sobre el mapa. El panel no lleva sombra: es hermano del mapa, no una capa encima.

## 6. Íconos

Un solo juego, propio, en `src/components/icons.tsx`: trazo de 1,75, 22px junto a texto de 16px. Sin emoji.

## 7. Navegación

- Celular: mapa arriba, panel abajo (máximo 56% del alto), al alcance del pulgar. El panel y el mapa son hermanos: el panel nunca tapa el mapa.
- El panel se pliega en celular con la manija de arriba, por toque o deslizando hacia abajo, y deja una franja: la manija sola, o la manija con el encabezado de la línea. Se abre solo cuando la persona abre algo nuevo (una línea, una parada, un viaje, el buscador).
- Desde 900px: el panel pasa a una columna de 400px a la izquierda, sin manija.
- Una acción principal por vista: "Buscar línea". "Cómo llegar" y "Ver todos" son secundarias y van a la par. Con una línea abierta no hay botón principal; la acción es tocar una parada.

## 8. Movimiento

- Entre lecturas el coche sigue el recorrido de su línea, a la velocidad que informa. Si dice que se mueve y la velocidad es 0, avanza a 17 km/h. Sin recorrido, sigue el rumbo. No pasa de 60 s ni de 600 m desde la última lectura. Una lectura nueva se alcanza en 1,5 s; un salto de más de 500 m no se desliza; una corrección chica hacia atrás no se muestra.
- La flecha del coche apunta hacia donde va, del color de la línea, y gira con el mapa. Se dibuja siempre que el rumbo se conoce: entera si avanza, un poco más suave si está detenido, y atenuada si la señal es vieja.
- La ida de la línea elegida es una línea continua y la vuelta es punteada, con una leyenda chica que dice "ida" y "vuelta". El encabezado dice el origen y el destino de ese sentido, con el nombre de la primera y la última parada.
- Controles: 120 ms con `--ease-out`. El diálogo entra en 240 ms desde abajo.
- Con movimiento reducido: una lectura nueva salta a su lugar, sin deslizamiento.

## 9. Foco, teclado y tacto

- Foco: contorno de 2px en `--focus` con 2px de separación. El campo de búsqueda muestra su cursor y no dibuja anillo.
- Todo control mide al menos 44×44. Los botones llevan `touch-action: manipulation`.
- El zoom del navegador queda libre.
- Las paradas del mapa no se alcanzan con teclado: por eso la lista de paradas del panel existe siempre y hace lo mismo.

## 10. Estados

Cada vista que carga datos tiene los suyos, con texto: "Buscando colectivos…", "Cargando recorrido…", sin coches en camino, línea sin paradas, línea sin seguimiento en vivo, y error con "Reintentar". Cuando la fuente no responde se sigue mostrando la última posición con su antigüedad escrita.

Un coche con señal de más de 2 minutos se ve atenuado; con más de 15 no se muestra.

## 11. Textos

- Español neutro, sin voseo ni tuteo marcado en imperativos regionales ("Activa el permiso", no "Activá").
- Todo tiempo de llegada lleva "≈": es una estimación y se dice.
- Los nombres de paradas y líneas se muestran como vienen de la fuente.
- La interfaz no se explica a sí misma y no menciona cómo se obtienen los datos, salvo cuando fallan.

## 12. Rechazado a la vista

- **Colores de línea chillones, y también apagados.** Los de la fuente compiten entre sí y cansan; una primera corrección con tonos oscuros y poca saturación fue rechazada por apagada. El punto pedido es divertido sin gritar: misma luminosidad para todas, saturación viva.
- **Páginas de buscador a la vista en la app.** Se pidió que existan y se lean, pero que no aparezcan en el mapa ni en el panel. No se oculta texto dentro de una página: lo que lee el buscador es lo mismo que ve quien entra.
- **Avisos largos.** Un aviso de dos oraciones no entra en el celular: en el encabezado de una línea ocupaba 2 renglones a 390 px y 4 a 320. Los estados son de pocas palabras ("Sin datos en vivo"); el detalle va donde la persona lo necesita, en la parada.
- **Un panel que no se puede sacar de encima.** Las opciones siempre en pantalla tapan el mapa en un celular. Tiene que poder bajarse con un gesto y volver igual de fácil.
- **"No hay viaje" sin decir por qué.** Un mensaje genérico deja a la persona sin saber qué cambiar. Cuando no hay viaje se dice cuál punta queda lejos de los recorridos y a qué distancia está su parada más cercana; antes de rendirse, la caminata aceptada se amplía de 700 m a 1,2 km y a 2 km.
- **Un viaje que no se entiende.** Abrir solo la primera línea de una combinación y esconder los puntos fue rechazado. Un viaje se ve entero: los tramos de todas sus líneas a la vez, las paradas de subida, cambio y bajada, la ubicación y los puntos de salida y destino, y los pasos en el panel.
- **Ubicación igual a un punto marcado.** Si el punto propio y un punto elegido se ven igual, no se sabe cuál es cuál. La ubicación es azul con halo; la salida marcada es un anillo; el destino, un punto lleno.
- **Esperas sin señal.** Un texto solo no alcanza para saber que algo está cargando: toda espera lleva un anillo que gira (`Loading.tsx`), en el mapa, la línea, el buscador y "Cómo llegar".
- **Todos los coches de golpe.** Abrir y ver 160 marcadores no ayuda a nadie a encontrar el suyo. Al abrir el mapa está en calma y buscar es lo primero que se ofrece.
- **Preguntar "dónde" al entrar.** Una entrada de "qué pasa cerca" fue rechazada: cada persona ya sabe qué colectivo usa. Lo que sí sirve es decir un destino y recibir opciones, como en un mapa de viajes.

Cada corrección de quien dirige se escribe aquí como principio con su razón.

## 12 bis. Decidido por quien dirige

- **El aviso desde la línea.** "Avisarme" aparece apenas se elige la línea, antes de cualquier parada, a la par de "Ver paradas" y con el mismo peso: contorno, no una franja de color. Ese enlace lleva solo la línea (`?start=l_<línea>`) y el bot pide la ubicación para elegir la parada; el botón dentro de una parada sigue existiendo y lleva la parada exacta.
- **El tab de Ida y Vuelta se queda.** Se probó reemplazarlo por dos filas plegables y fue rechazado. Lo que sí se pidió: que las paradas no aparezcan de entrada y que cada sentido diga su primera y su última parada, que son las puntas del recorrido, no la posición de la persona ni la de un coche.

- **Ver dónde estoy.** El punto propio aparece al tocar el botón de ubicación y sigue a la persona mientras camina. Si ya dio permiso antes, aparece solo al abrir, sin mover el mapa ni preguntar. Sin permiso, todo lo demás funciona igual y el aviso dice qué hacer.

- **Líneas guardadas sin base de datos.** La estrella guarda en el celular (`localStorage`, clave `lineas-guardadas`). No hay cuentas ni sincronización.
- **Avisos por Telegram.** Se piden desde la parada ("Avisarme por Telegram") o escribiendo en el bot ("avisame cuando pase el 41"). El bot pide la ubicación si no hay una guardada con /casa, elige la parada de esa línea más cercana y avisa una vez, a 3, 5 o 10 minutos. Los avisos pendientes y, si se pidió, una ubicación por 90 días viven en Redis: es lo que el producto guarda de la persona fuera del celular. El botón del mapa solo existe si `NEXT_PUBLIC_TELEGRAM_BOT` está definida.
- **Visitas.** Google Analytics 4 se carga solo si `NEXT_PUBLIC_GA_ID` está definida, y el script entra después de que la página ya responde. No hay cuenta. Los eventos son la línea elegida, la parada abierta, el viaje elegido y el botón de Telegram; no se envía la ubicación, una dirección ni el chat.
- **Crédito.** "Hecho por Franco Duran, fundador de la comunidad jujuy.dev", con enlaces a `https://jujuy.dev.ar`, Instagram (`francoduran.23`) y X (`fdurandev`). Vive al pie del panel de inicio, en texto secundario; no compite con la acción principal.
- **Acceso directo.** El aviso "Instalar acceso directo" es secundario, sobre el fondo de la página. En Android usa el aviso del navegador. En Safari del iPhone dice: tocá Compartir y después “Agregar a inicio”. No se muestra si el sitio ya está instalado o si se tocó Ocultar.

## 13. Trampas del proyecto

- **El mapa con alto 0.** La hoja de estilos de MapLibre pone `position: relative` en el contenedor y carga después de la nuestra. El selector tiene que ser `.stage .map`, no `.map`.
- **El worker de MapLibre.** Desde la versión 6 es un archivo aparte que el empaquetador no lleva. Se copia a `public/` con `npm run worker` (corre solo antes de `dev` y `build`) y se declara con `setWorkerUrl`.
- **Coordenadas.** Santa Ana manda `[lat, lng]`; MapLibre y GeoJSON usan `[lng, lat]`. Se invierte una sola vez, en `src/lib/santa-ana.ts`.
- **Qué trazado es la ida.** `paths[0]` no siempre es la ida: en 13 de las 38 líneas de dos sentidos las paradas "ida" están sobre `paths[1]`. El sentido de cada trazado se asigna según qué paradas caen sobre él (`labelPaths` en `src/lib/eta.ts`). Con el sentido al revés, el tiempo de llegada sale calculado con los coches que van para el otro lado.
- **El sentido al pedir el aviso por chat.** El orden de `paths` tampoco dice hacia dónde va el colectivo. Se agrupan las paradas por su `direction` y se toma la más cercana de cada sentido. Si la diferencia es de 150 m o menos, se pregunta ("hacia X"); si solo uno de esos sentidos tiene un coche en camino, se usa ese y se dice por qué.
- **Un coche detenido.** Informa el último rumbo que tuvo, que puede ser viejo. Para contarlo como "viene" tiene que coincidir el rumbo y además estar sobre este trazado y no sobre el paralelo.
- **Cachear un error un día entero.** En las rutas con `revalidate` no se atrapa el error: si se devuelve un 502, Next lo guarda 24 horas. Dejando que falle, sigue sirviendo la última copia buena.
- **La hora del celular.** La antigüedad del dato se mide desde que llegó a este dispositivo, no contra la hora del servidor: un reloj adelantado mostraba "Santa Ana no responde" con datos frescos.
- **Probar el bot sin bot.** Sin `TELEGRAM_BOT_TOKEN` los mensajes no se envían y quedan en el registro del servidor; sin Redis los avisos viven en memoria. Las dos cosas lo anuncian en el registro y `/api/telegram/tick` lo dice en su respuesta (`store`, `bot`). En Vercel la memoria no sirve: cada pedido puede caer en otra instancia.
- **La revisión por minuto.** El plan gratuito de Vercel solo permite tareas programadas una vez al día, así que `/api/telegram/tick` lo llama un programador externo con `?key=`. Un aviso se borra antes de enviarse: si el envío falla se pierde ese aviso, que es mejor que repetirlo cada minuto.
- **El mapa va detrás de la calle.** Medido el 8 oct 2026: la posición ya tiene una mediana de 16 s cuando Santa Ana la entrega, y eso no se puede bajar. Lo que sí: `stale-while-revalidate` en `/api/fleet` hacía que con poco tráfico cada consulta recibiera la copia anterior (18 s de vieja en vez de 7). La flota no usa `stale-while-revalidate` y se consulta cada 5 s. Entre lecturas el coche sigue el recorrido (`src/lib/motion.ts`), con tope de 60 s y 600 m, para que no se vea quieto. Un deslizamiento en línea recta de varios segundos lo dejaba tarde y fuera de la calle.
- **La flota necesita token.** Desde el 8 oct 2026 `/api/fleet` de Santa Ana exige `Authorization: Bearer` con un JWT de su Appwrite; el servidor lo pide con `SANTA_ANA_SESSION`. Cuando responden 401 o 429, `/api/fleet` devuelve 200 con `unavailable` y eso se cachea 60 s: antes, cada página abierta les mandaba un pedido condenado a fallar cada 5 s. La pantalla dice cuál de las dos cosas pasa.
- **Lo que se promete en un título tiene que estar en la página.** Una línea de la que solo se conoce el recorrido no dice "paradas" en su título. Los textos de estas páginas afirman solo lo que el dato sostiene: las posiciones en vivo dependen de que Santa Ana las entregue.
- **El buscador de direcciones** es el servicio público de OpenStreetMap (Nominatim): compartido y gratuito, con límite de uso. Se consulta solo al enviar la búsqueda, nunca por tecla, y la respuesta se cachea un día. Si el sitio crece, hay que cambiarlo por uno propio o pago.
- **"Cómo llegar" depende del orden de las paradas** que manda Santa Ana. En la línea 15 ese orden está invertido, así que puede proponer el sentido equivocado.
- **El orden de las paradas no es el número que manda Santa Ana.** Hay paradas sin número de orden (se iban al final y aparecían como el "hasta" del sentido) y en tres líneas (15, 2 por Perón, 2 por Savio) el número va en contra del recorrido. El trazado sí va en el sentido de marcha: lo confirma el rumbo de los coches en movimiento (37 a favor, 0 en contra, en 7 líneas). `orderStops` en `src/lib/route.ts` ubica cada parada a lo largo del trazado de su sentido y renumera; se aplica una sola vez, en `lineDetail`, y de ahí leen la lista, las puntas, el bot y "Cómo llegar". Una parada a más de 150 m del trazado nunca queda primera ni última.
- **Líneas donde la vuelta no empieza donde termina la ida.** Medido: coincide en 35 de 38 líneas (700 m de tolerancia). No en la 2 por Perón, la 2 por Savio y la 46, donde el trazado publicado no sigue a sus propias paradas. No se corrige desde acá.
- **Mover un coche sin saber por dónde va.** Entre lecturas un coche avanza solo sobre un recorrido conocido. Empujarlo según su rumbo lo hacía cruzar manzanas en línea recta en "Ver todos" y con líneas guardadas, porque el mapa solo tenía el recorrido de la línea abierta. Sin recorrido se queda en su última lectura; un coche sin señal no se mueve nunca (`heldWithoutSignal`). Los recorridos de las líneas guardadas se cargan para que sus coches rueden por la calle.
- **Estimar con el ritmo del propio coche no mejoró el aviso: probado y descartado.** El bot calcula la llegada con 17 km/h fijos. Medido sobre la flota (viernes 11:21, 127 coches, 6 min): mediana 18,7 km/h contando paradas, una cuarta parte bajo 14,7 y el 10% bajo 11,8. Se probó reemplazar el promedio por el ritmo que cada coche traía en los 3 minutos previos: prediciendo los 5 minutos siguientes de 99 coches, el error mediano fue 409 m contra 396 m del promedio fijo, y el error mayor a 500 m bajó de 39% a 32%, dentro del ruido. Retener el aviso de un coche detenido también falló: 3 de 4 arrancaron enseguida. La velocidad depende del tramo más que del coche; mejorar esto de verdad pide guardar lecturas varios días y sacar velocidades por tramo.
- **"5 minutos" no es un dato, es un centro.** Simulados 257 avisos de 5 minutos sobre la flota real (viernes 11:50, seguidos 6,3 min o más): el coche llegó en menos de 3 min en el 24%, entre 3 y 6 en el 51% y tardó 6 o más, o no había llegado, en el 26%. La mediana real fue 4,0 min. De los 36 que no llegaron, 26 seguían en camino a unos 9 km/h y 10 ya no estaban sobre ese recorrido. Casi ningún aviso sale con el coche detenido (2 de 257). Depende de la línea: en la 10 y la 5 más de la mitad llegaron tarde. Por eso el aviso dice la distancia, el mejor cálculo y el rango ("está a 1,4 km… Llega en unos 5 min; puede ser entre 3 y 7"), con los extremos medidos de velocidad, 12 y 31 km/h (`arrivalRange` en `src/lib/alerts.ts`). El 4% de coches que no vienen sigue sin resolver.
- **Insertar estilos buscando un selector por texto.** `.empty {` también está dentro de `.loading.empty {`. Un reemplazo sobre la primera coincidencia partió esa regla, dejó `.loading .line-alert` (que no coincide con nada) y llegó a producción: el botón salía sin márgenes y nadie lo vio hasta la captura. Los estilos nuevos se agregan en un lugar inequívoco y la pantalla se mira, no solo se lee su texto.
- **Entradas nuevas del bot.** `pick-line` responde a una pregunta que el bot hizo antes; llamada sin nada pendiente contesta "Ese paso ya venció". Un enlace de línea usa `start-line`. Y toda entrada que nombra una línea tiene que estar en `needsLines` de `ask-run.ts`: si falta, busca en una lista vacía y dice que la línea no existe. Las pruebas de `ask.ts` no ven esto último porque reciben las líneas a mano; se comprueba simulando el webhook.
- **Deslizar la manija.** El dedo termina fuera de la manija, así que sin `setPointerCapture` el gesto no se registra y solo anda el toque.
- **El teclado del buscador.** Enfocar el campo al abrir levanta el teclado en el celular y tapa las líneas. El campo se enfoca solo con puntero fino (teclado y mouse); en pantalla táctil espera a que lo toquen.
- **El foco del buscador.** `showModal()` pone el foco en el primer control, que es el botón de cerrar, y `autoFocus` de React corre antes. El campo se enfoca a mano después de abrir; si no, escribir no filtra.
- **`servicio-humahuaca`** tiene 4 tramos y ninguna parada; `49bis` llega sin nombre.
- **El GeoServer municipal** es HTTP sobre una IP: el navegador no puede leerlo desde un sitio HTTPS. Se copia con `npm run sync:muni`.
- **Quitar "Parada " del nombre** deja filas que dicen solo "4" o "3 ida". No se recortan los nombres.
- **Auditar con `tail`** corta los resultados de celular. El informe completo está en `audit/report.json`.

## 14. Decisiones abiertas

Un agente no decide estas:

- El nombre del producto. "Colectivos Jujuy" es provisorio.
- La paleta neutra y la tipografía, propuestas sin referencias.
- Qué color llevan las 15 líneas sin seguimiento (hoy, tinta).
- Modo oscuro.
- Si se pide permiso a Santa Ana y a la Municipalidad para usar sus datos.

## 15. Antes de decir que está terminado

- ¿La auditoría de kero-audit (`audit.mjs`) da 0 faltas graves, con las pantallas contadas?
- ¿Se abrió cada captura de `audit/`, en celular y en escritorio?
- ¿Las chapas siguen siendo lo único con color fuerte?
- ¿Se entiende cuánto falta sin leer nada más que la fila de la parada?
- ¿`npm test` y `npm run build` pasan?
