# Alcance — Colectivos Jujuy en vivo

Tesis: la posición de cada coche ya es pública, pero la app oficial pone un inicio de sesión entre la persona y su parada. Este producto abre directo en el mapa y responde cuánto falta para que llegue mi colectivo. El diagnóstico está en [research.md](research.md).

## Abrir y ver

| Código | Función | Qué hace |
|:--|:--|:--|
| A1 | Mapa sin cuenta | La persona abre el enlace desde el celular y ve el mapa con los colectivos, sin registrarse ni instalar nada. |
| A2 | Coches en vivo | Ve dónde está cada coche de Santa Ana en servicio, moviéndose de forma continua entre una lectura y la siguiente, y hacia dónde va. |
| A3 | Dato confiable | Distingue de un vistazo un coche con señal reciente de uno con señal vieja, y deja de ver los que llevan más de 15 minutos sin reportar. |
| A4 | Aviso de corte | Cuando la fuente no responde, sigue viendo la última posición conocida con la antigüedad escrita. |
| A5 | Dónde estoy | Ve su propia ubicación en el mapa si la permite, y el mapa funciona igual si no. |
| A6 | Acceso directo | Puede agregar el sitio a la pantalla de inicio. Si ya está instalado o lo descartó, el aviso no vuelve. |

## Elegir mi línea

| Código | Función | Qué hace |
|:--|:--|:--|
| L1 | Buscar línea | Encuentra su línea por número entre todas las de la ciudad. |
| L2 | Recorrido | Ve de dónde a dónde va la línea elegida. La ida se dibuja continua y la vuelta punteada, también en las líneas sin seguimiento. |
| L3 | Solo mis coches | Al elegir una línea ve únicamente los coches de esa línea. |
| L4 | Líneas sin seguimiento | Ve el recorrido de las 15 líneas que no reportan posición, con el aviso de que no tienen seguimiento en vivo. |
| L6 | Tus líneas | Marca con una estrella las líneas que usa y las tiene a un toque al abrir, guardadas en ese celular. |
| L7 | Mapa en calma | Al abrir no ve los 160 coches de la ciudad: ve los de sus líneas guardadas, o ninguno, y puede pedir verlos todos. |

## Esperar en la parada

| Código | Función | Qué hace |
|:--|:--|:--|
| P1 | Paradas de la línea | Ve cada sentido resumido en sus dos puntas y, al tocarlo, sus paradas sobre el recorrido. |
| P2 | Cuánto falta | Toca una parada y ve qué coches de esa línea vienen y en cuántos minutos llega cada uno, marcado como estimado. |
| P4 | Coche con rampa | Sabe cuáles de los coches que vienen tienen rampa. |

## Saber qué tomar

| Código | Función | Qué hace |
|:--|:--|:--|
| V1 | Cómo llegar | Elige de dónde sale y a dónde va, y ve qué líneas lo llevan, de la más rápida a la más lenta. |
| V7 | Con un cambio | Cuando ninguna línea llega directo, o cambiar es claramente más rápido, ve la combinación de dos líneas y dónde cambiar. |
| V2 | Destino por dirección | Escribe una calle y altura o el nombre de un lugar para elegir el punto. |
| V3 | Destino en el mapa | Marca la salida o el destino tocando el mapa. |
| V4 | Dónde subir y bajar | En cada opción ve la parada donde sube, la parada donde baja, cuánto camina en cada punta y el tiempo estimado. |
| V5 | El viaje en el mapa | Toca una opción y ve juntas las líneas del viaje, dónde sube, dónde cambia y dónde baja, sin perder su ubicación ni sus puntos. |
| V8 | Paso a paso | Ve el viaje en pasos, con cuánto falta para que llegue el colectivo a cada parada de subida. |
| V6 | Mejor a pie | Cuando caminar es corto, ve cuánto tarda caminando antes que las opciones. |

## Que me avisen

| Código | Función | Qué hace |
|:--|:--|:--|
| T1 | Aviso por Telegram | Apenas elige la línea, o desde una parada, pide un aviso y el bot le escribe cuando el colectivo de esa línea está por llegar. |
| T2 | Con cuánta anticipación | Elige que le avise a 3, 5 o 10 minutos. |
| T3 | Un aviso, una vez | Cada aviso suena una sola vez; si en 90 minutos no viene ningún coche, se cancela y se lo dice. |
| T4 | Cancelar | Borra sus avisos pendientes escribiendo /cancelar. |
| T5 | Aviso desde el chat | Escribe en el bot la línea, por ejemplo “avisame cuando pase el 41” o /avisame 41, y arma el mismo aviso sin pasar por el mapa. |
| T6 | Parada más cercana | El bot pide la ubicación (o una dirección), elige la parada de esa línea más cercana y, si los dos sentidos quedan cerca, pregunta hacia dónde o se queda con el que tiene un colectivo en camino. |
| T7 | Lugar guardado | Con /casa guarda una ubicación 90 días y el aviso siguiente la usa sola. |
| T8 | Ver avisos | /avisos lista los avisos pendientes. |
| T9 | Sin seguimiento, sin aviso | Si la línea no tiene posición en vivo, el bot lo dice y no crea un aviso. |

## Que lo encuentren

| Código | Función | Qué hace |
|:--|:--|:--|
| B1 | Una página por línea | Quien busca "paradas de la línea 12 en Jujuy" encuentra una página con el recorrido y las paradas de ida y de vuelta, y de ahí abre la línea en el mapa. |
| B2 | Índice de líneas | Encuentra todas las líneas de la ciudad en una página. |
| B3 | Preguntas frecuentes | Encuentra respondido qué es el sitio, cómo saber qué colectivo tomar y de dónde salen los datos. |
| B4 | Legible para asistentes | Un asistente de IA puede leer qué es el sitio y qué responde cada página, y citarlo. |

## Llevarlo encima

| Código | Función | Qué hace |
|:--|:--|:--|
| C1 | En la pantalla de inicio | Agrega el sitio a la pantalla del celular y lo abre como una app. |
| C2 | Compartir línea | Manda un enlace que abre directo en una línea o una parada. |

## Lo que no hace

- **Cuentas y favoritos sincronizados entre dispositivos.** La tesis es que nada se interpone entre la persona y el mapa; una cuenta lo contradice. Las líneas guardadas (L6) viven solo en el celular. Los avisos (T1) usan el Telegram que la persona ya tiene, sin registro en el sitio. Contar visitas no es una cuenta: Google Analytics solo entra si está `NEXT_PUBLIC_GA_ID`, no pide registro y no recibe la ubicación.
- **Avisos que se repiten.** "Todos los días a las 7:30" no existe: cada aviso es de una vez.
- **Viajes con dos o más cambios.** "Cómo llegar" propone viajes directos o con un solo cambio. La espera del segundo colectivo es un supuesto de 8 minutos, porque no hay horarios.
- **Paradas cerca como entrada.** Se probó y se descartó: cada persona ya sabe qué colectivo usa. La entrada es buscar la línea.
- **Horarios teóricos.** No hay fuente; el producto muestra lo que está pasando, no lo que debería pasar.
- **Posición en vivo de El Urbano y la línea 26.** No hay fuente pública; se muestran solo sus recorridos (L4).
