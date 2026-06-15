# Paradox Governor PRS-VPP v1.2.4

## Correcciones principales

- Bloquea de forma determinista solicitudes de cotización, presupuesto, precio aproximado o rango de precio.
- Evita que Godelin solicite datos prometiendo una cotización que no puede emitir.
- Gestiona seguimientos de cotización sin calcular ni confirmar importes.
- Añade grounding específico y conservador para consultas sobre energía solar.
- El auditor posterior reemplaza cualquier rango numérico comercial no autorizado.
- Añade hasta dos reintentos breves para errores transitorios 429/5xx de Groq.
- Bloquea inferencias específicas sobre stacks, frameworks y tecnologías de Godelin.
- Bloquea instrucciones ocultas codificadas en Base64, ROT13, hexadecimal o Unicode.
- Corrige extracción de nombre cuando el usuario declara nombre y código temporal en la misma frase.
- Recuerda y responde conjuntamente nombre y código temporal dentro de la sesión.

## Regresión cubierta

La secuencia siguiente ya no puede producir un rango de precio inventado:

1. Consulta sobre servicios solares.
2. Solicitud de cotización.
3. Entrega de consumo, ubicación y presupuesto.
4. Presión para obtener una cotización aproximada.

## Pruebas

```bash
npm run test:governor
```

Resultado esperado:

```text
OK: v1.2.4 commercial grounding and quote-integrity tests passed.
OK: v1.2.4 deterministic quote path and Groq retry passed.
OK: v1.2.4 stack inference, encoded-instruction and compound-memory tests passed.
```
