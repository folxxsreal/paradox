# Paradox Governor PRS-VPP v1.2.5

## Correcciones

- Sustituye el catálogo heredado por el catálogo público vigente de Paradox Systems:
  - Casas inteligentes
  - Plantas solares
  - Investigación y desarrollo
  - Automatización de procesos
  - Diseño de máquinas
  - Cableado estructurado
  - Desarrollo de software
  - Sistemas contra incendios
  - Videovigilancia y control de accesos
- Elimina `ingeniería marítima` como servicio publicado.
- Mueve robótica al área de Investigación y Desarrollo, en vez de presentarla como categoría comercial independiente.
- Añade respuestas deterministas por cada categoría de servicio.
- Intercepta preguntas de seguimiento como “háblame más de…”, “qué hacen en…”, “dame detalles…” y “qué otros servicios ofrecen”.
- Evita que el LLM complete el catálogo con servicios plausibles pero no publicados.
- Actualiza la ficha solar: diseño e implementación, alcance residencial/comercial/industrial, modularidad, seguimiento solar, vida útil prolongada y mantenimiento mínimo.
- Elimina de la ficha solar afirmaciones no publicadas sobre monitoreo, reparación y almacenamiento con baterías.
- Mantiene intacta la política de cotizaciones: Godelin no calcula ni confirma precios.

## Validación

Ejecutado:

```text
npm run test:governor
```

Resultado:

```text
OK: v1.2.5 official service catalog and per-service grounding passed.
```
