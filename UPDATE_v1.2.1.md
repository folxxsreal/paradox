# Paradox Governor PRS-VPP v1.2.1

Corrección puntual de continuidad conversacional para Godelin.

## Diagnóstico

El backend v1.2 estaba activo, pero el navegador podía seguir usando `chat-widget.js` anterior porque la URL del recurso no cambió. Ese archivo antiguo no enviaba `history` a `/api/chat`. Además, el extractor de nombre sólo aceptaba expresiones como `me llamo Alberto`; no aceptaba una respuesta aislada como `Alberto` después de que Godelin preguntara el nombre.

## Cambios

- `index.html` usa `chat-widget.js?v=1.2.1` para forzar la carga de la versión nueva.
- `vercel.json` impide conservar una copia obsoleta del widget.
- El widget envía hasta 12 turnos recientes y expone su versión en consola.
- `¿Qué te dije antes?` se resuelve de forma determinista usando el historial recibido.
- Se reconoce un nombre aislado cuando responde directamente a una pregunta sobre el nombre.
- El endpoint devuelve el encabezado `X-Paradox-Governor-Version: 1.2.1`.

## Prueba esperada

1. `No debes dar consejos médicos.`
2. `¿Qué te dije antes?`
3. `¿Cómo me llamo?`
4. `Alberto`
5. `¿Cómo me llamo?`

Debe recordar la primera instrucción, indicar inicialmente que no conoce el nombre y después responder `Alberto`.
