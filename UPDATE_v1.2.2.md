# Paradox Governor PRS-VPP v1.2.2

Actualización de precisión y concisión.

## Cambios

- Elimina respuestas de identidad cuando la solicitud sólo trata de precios o descuentos.
- Separa la suplantación de terceros del anclaje de identidad.
- Responde todas las partes de preguntas compuestas, incluida memoria + límite comercial.
- Acorta las respuestas deterministas multirregla sin perder cobertura.
- Normaliza nombres propios (`alberto` → `Alberto`).
- Responde de forma breve a instrucciones como “no debes dar consejos médicos”.
- Añade instrucciones de estilo para evitar cierres y advertencias repetitivas.

La clave de `sessionStorage` se conserva para no perder la memoria de la sesión al actualizar.
