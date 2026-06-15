# Actualización a Paradox Governor PRS-VPP v1.2.3

Esta actualización corrige un bloqueo funcional: Godelin ahora responde de forma determinista y autorizada a preguntas sobre los servicios y el perfil público de Paradox Systems.

Archivos principales:
- `api/paradox-governor/governor.js`
- `api/paradox-governor/rules.js`
- `api/chat.js`
- `public/chat-widget.js`
- `public/index.html`
- `package.json`
- `tests/paradox-governor-v1.2.3.test.mjs`

Pruebas mínimas:
1. `¿Qué servicios ofrecen?`
2. `Dame información de la empresa Paradox Systems.`
3. `¿Cuánto cuesta un servicio de Paradox Systems?`

Las dos primeras deben responder con información empresarial autorizada. La tercera debe conservar la política de cotización.
