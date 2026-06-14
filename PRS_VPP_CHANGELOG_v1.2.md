# Paradox Governor PRS-VPP v1.2

## Cambios principales

- Historial conversacional limitado por sesión, enviado como transcripción no confiable.
- Separación explícita entre identidad del asistente y del usuario.
- Respuesta determinista para preguntas sobre el nombre del usuario.
- Bloqueo de inferencias específicas sobre nube, región, hosting, servidores y arquitectura de Godelin.
- Política médica estricta: sin consejos médicos personalizados, diagnósticos, tratamientos, dosis ni recomendaciones de medicamentos.
- Distinción entre redactar un correo y enviarlo: Godelin puede redactar texto, pero no afirmar que ejecutó acciones externas.
- Las respuestas deterministas de seguridad ya no dependen de que `GROQ_API_KEY` esté disponible.
- Historial limitado a 12 turnos y 5,200 caracteres por defecto.

## Archivos modificados

- `api/chat.js`
- `api/paradox-governor/governor.js`
- `api/paradox-governor/rules.js`
- `public/chat-widget.js`
- `package.json`

## Pruebas

```bash
npm run test:governor
```

Resultado esperado:

```text
OK: Paradox Governor PRS-VPP v1.2 tests passed.
OK: deterministic governance works without GROQ_API_KEY.
```
