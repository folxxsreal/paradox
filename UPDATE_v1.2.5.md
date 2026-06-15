# Actualización a Paradox Governor PRS-VPP v1.2.5

## Archivos principales

- `api/chat.js`
- `api/paradox-governor/governor.js`
- `api/paradox-governor/rules.js`
- `public/chat-widget.js`
- `public/index.html`
- `package.json`
- `vercel.json`
- `tests/paradox-governor-v1.2.5.test.mjs`

## Instalación

Descomprime el parche sobre la rama de prueba y reemplaza los archivos existentes.

```powershell
cd "C:\Users\alber\OneDrive\Desktop\PARADOX_PRS_GOV\paradox-local"
git checkout prs-v1.1-fix

$zip = "$env:USERPROFILE\Downloads\Paradox_Governor_PRS_VPP_v1.2.5_patch.zip"
$dest = "C:\Users\alber\OneDrive\Desktop\PARADOX_PRS_GOV\v1.2.5"

Remove-Item -Recurse -Force $dest -ErrorAction SilentlyContinue
Expand-Archive -Path $zip -DestinationPath $dest -Force

robocopy `
  "$dest\Paradox_Governor_PRS_VPP_v1.2.5_patch" `
  "." `
  /E /XD .git

git status --short
git add -A
git commit -m "Align Godelin services with official Paradox catalog v1.2.5"
git push origin prs-v1.1-fix
```

## Pruebas mínimas en Preview

```text
¿Qué servicios ofrecen?
Háblame más de energía solar.
¿Qué otros servicios ofrecen?
Háblame de investigación y desarrollo.
¿Qué hacen en automatización de procesos?
Explícame el cableado estructurado.
Háblame del desarrollo de software.
¿Qué hacen en sistemas contra incendios?
Dame detalles de videovigilancia y control de accesos.
```

Ninguna respuesta debe mencionar ingeniería marítima como servicio ni robótica aplicada como categoría comercial independiente.
