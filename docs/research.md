# Diagnóstico — Colectivos Jujuy en vivo

Fecha de todas las mediciones: 8 de octubre de 2026.

## Tesis

La app de Santa Ana no falla por falta de datos: la posición de cada coche ya es pública, pero la app pone un inicio de sesión entre la persona y su parada. Este producto abre directo en el mapa, sin cuenta, y responde una sola pregunta: cuánto falta para que llegue mi colectivo.

## El dato que cambia la conversación

`https://bus.santaanasrl.com.ar/` abre en una pantalla de "Inicia sesión para continuar" con email, contraseña y "Crear cuenta" (captura a 390×844, 8 oct 2026). Los mismos datos que esa pantalla protege se obtienen sin credenciales en `/api/fleet`, `/api/line-routes` y `/api/line-stops`. El login no protege nada; solo frena a quien está esperando en la parada.

No hace falta la cuenta de Appwrite para nada de lo que sigue, y no se usó.

## Lo que existe, medido

### API de Santa Ana (`https://bus.santaanasrl.com.ar/api`)

| Endpoint | Resultado | Peso | Tiempo |
|:--|:--|:--|:--|
| `GET /fleet` | 200 · 158 coches, 158 con `gps.fresh = true`, 39 líneas distintas | 88 KB | 0,43 s |
| `GET /line-routes` | 200 · 39 líneas con `id`, `number`, `name`, `color`, `mapUrl`, `paths` | 291 KB | 0,41 s |
| `GET /line-stops?lineId=2-savio` | 200 · 85 paradas | 19 KB | 0,26 s |
| `GET /lines` | 404 | — | — |

- **La lista de todas las líneas sale de `/line-routes`.** No hay endpoint liviano; se itera `routes[].id` y con cada uno se pide `/line-stops?lineId=`.
- Forma de la flota: `{ vehicles, updatedAt, source }`. Cada coche trae `assignedLineId`, `internalNumber`, `latitude`, `longitude`, `speedKmh`, `course`, `hasRamp`, `fixTime` y `gps.{fresh, ageSeconds, moving}`.
- Forma de las paradas: `{ stops, total, updatedAt }`, cada una con `name`, `latitude`, `longitude`, `direction`, `order`.
- No se observó cabecera `Access-Control-Allow-Origin` ni `Cache-Control` en `/fleet`: el navegador no puede llamarla directo.
- La línea con más coches en ese momento fue la 10 (12 coches); 28 y 16 tenían uno solo.

### Diferencias con el SDD

- `fleet` pesa 88 KB, no ~70 KB.
- `servicio-humahuaca` trae **4** tramos en `paths` (701, 253, 402 y 52 puntos), no 2. "`paths[0]` es ida y `paths[1]` es vuelta" vale para las otras 38 líneas, no para esta.
- `49bis` llega con `name` vacío también en `/line-routes` (no solo en la flota), así que el nombre no se puede completar desde ahí: hay que escribirlo a mano.

- **El orden de `paths` no indica el sentido.** Medido con las paradas de cada línea: en 13 de las 38 líneas de dos sentidos (6, 12, 19, 21, 25, 28, 32, 33, 34, 41, 45, 46 y 49bis) las paradas marcadas "ida" están sobre `paths[1]`, a 3–7 m, y a más de 100 m de `paths[0]`. El sentido de cada trazado hay que deducirlo de las paradas.
- **Dos líneas con datos dudosos en la fuente.** En `2-savio` las paradas "ida" quedan a ~98 m del trazado más cercano, o sea que ninguno de los dos las sigue bien. En la 15 las paradas "ida" están sobre su trazado pero numeradas en orden inverso. En ambas el tiempo estimado puede salir mal y no hay forma de corregirlo sin que Santa Ana arregle el dato.

### Mapa municipal (`http://45.186.124.53/munimap/lineas/`)

Página Leaflet de la Municipalidad de San Salvador de Jujuy, modificada el 24 sep 2026. Lee de un GeoServer por WFS, sin autenticación:

`http://45.186.124.67:8080/geoserver/planificacion/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=planificacion:recorridos_lineas&outputFormat=application/json&srsName=EPSG:4326`

- `recorridos_lineas`: 105 tramos `MultiLineString` (297 KB), con `linea`, `name`, `description`, `empresa`, `sentido`.
- `barrios`: 40 polígonos (148 KB).
- Solo recorridos: no hay paradas ni posiciones.

| Empresa | Líneas | En vivo |
|:--|:--|:--|
| Santa Ana | 38 códigos (75 tramos) | Sí, por la API de Santa Ana |
| El Urbano | 14: 1, 7, 9, 13 (150 Hectáreas), 13 (10 Hectáreas), 14, 22, 23, 31, 42 (Higuerilla), 42 (Antena), 43, 47, 48 | No |
| Sin empresa cargada | 1: 26 (Nueva zona Gorriti – Los Alisos) | No |

- **15 líneas de la ciudad no tienen posición en vivo.** De esas solo se puede mostrar el recorrido.
- Es HTTP sobre una IP, sin HTTPS: una página en Vercel no puede pedirlo desde el navegador. Se descarga del lado del servidor o se guarda una copia en el repositorio.
- La numeración no coincide del todo con Santa Ana: el municipio tiene "Línea 45 ex 49 bis" y además "Línea 49"; la API de Santa Ana tiene `45` y `49bis`. Hay que cruzarlas a mano antes de mostrarlas juntas.
- La línea 25 tiene un solo sentido cargado en el municipio.

## Cierre de la flota (8 de octubre de 2026)

- `GET /api/fleet` dejó de ser pública: sin credenciales responde 401 `{"error":"Autenticacion requerida"}` con `WWW-Authenticate: Bearer`. `/api/line-routes` y `/api/line-stops` siguen abiertas.
- Santa Ana indicó usar el token del usuario. Su app lo obtiene así: inicia sesión en su Appwrite (`https://appwrite.santaanasrl.com.ar/v1`, proyecto `6aa4501a00048053dc71`), pide un JWT (`POST /account/jwts`, dura 900 s) y lo manda como `Authorization: Bearer`.
- Límites vistos: 10 inicios de sesión por hora y 120 JWT por hora en Appwrite. La sesión dura un año.
- **Con el token, la flota respondió 429 `Too Many Requests` en 7 de 7 intentos**, espaciados hasta 30 s, siempre con `Retry-After: 10`. El token es aceptado; lo que frena es un límite de frecuencia cuyo valor no se conoce. Hay que preguntárselo a Santa Ana.
- La app oficial consulta la flota cada 10 s (`setTimeout` de `1e4` menos lo que tardó), una cuenta por persona y solo con la página visible. El sitio pide cada 20 s con una sola cuenta y recibe 429 igual, desde dos direcciones distintas.
- **El rechazo no depende de la cuenta.** Una segunda cuenta, sin uso previo, recibió 429 en su primer pedido (9 oct 2026, 01:0x UTC). Quedan tres explicaciones sin distinguir: un límite global de la flota, una penalización por dirección de origen (la del sitio en Vercel y la de la máquina de desarrollo, las dos con pedidos previos), o un filtro que solo deja pasar a su propia app. Se distingue mirando si la app oficial recibe 200 o 429 en `/api/fleet` en ese momento.
- Existe `GET /api/stop-arrivals?lineId=&stopId=`, que devuelve `arrivals` y `etaAvailable`; su app ya contempla que responda 429. No se probó.
- No se rota entre cuentas para esquivar ese límite: es un freno puesto a propósito por quien es dueño del dato.

## La competencia

- **Santa Ana Bus** (web, v0.1.0, "Desarrollo: MGU_Soft"): exige cuenta para ver cualquier cosa. Pestañas: Líneas, Mapa, Novedades, Perfil.
- **Mapa municipal**: recorridos y búsqueda origen/destino por barrio, sin coches en vivo, panel de 420 px pensado para escritorio.
- **Jujuy Bus** (Abanico, Tucumán): app para saber qué colectivo tomar. No se pudo confirmar si muestra posiciones en vivo. Fuente: [InfoNegocios Jujuy](https://infonegocios.info/in-jujuy?page=68).
- El Concejo Deliberante analizaba en noviembre de 2025 sumar seguimiento de unidades como parte de la nueva concesión. Fuente: [Todo Jujuy](https://www.todojujuy.com/jujuy/analizan-sumar-una-aplicacion-seguir-la-ubicacion-los-colectivos-san-salvador-jujuy-n282438).

**Lo que no se encontró:** reseñas de usuarios de Santa Ana Bus ni de Jujuy Bus. "La app actual es mala" es la opinión de quien dirige el proyecto; lo único medido es el muro de login.

## Supuestos

- Que la API siga abierta. No tiene clave ni términos publicados; Santa Ana puede cerrarla o cambiar el formato sin aviso. Es el riesgo más grande del proyecto y no tiene mitigación técnica, solo validar el formato y avisar "datos de hace X".
- ~160 coches es una lectura de un jueves a las 10:30. De noche y en fin de semana serán menos.
- Usar estos datos en un sitio público de un tercero no fue consultado con Santa Ana ni con el municipio.

## Fuentes

Siete leídas: el sitio de Santa Ana (1), sus cuatro rutas de API (medidas en directo), el mapa municipal y su GeoServer (medidos en directo), y dos notas de prensa. Ninguna tienda de apps ni reseña de usuarios.
