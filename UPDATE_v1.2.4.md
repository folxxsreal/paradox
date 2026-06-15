# Actualización a Paradox Governor PRS-VPP v1.2.4

Este parche se aplica sobre la rama de Preview actual.

## Archivos principales

- `api/chat.js`
- `api/paradox-governor/governor.js`
- `api/paradox-governor/rules.js`
- `api/paradox-governor/similarity.js`
- `public/chat-widget.js`
- `public/index.html`
- `package.json`
- `vercel.json`
- `tests/paradox-governor-v1.2.4.test.mjs`

## Comandos sugeridos

```powershell
cd "C:\Users\alber\OneDrive\Desktop\PARADOX_PRS_GOV\paradox-local"
git checkout prs-v1.1-fix

$zip = "$env:USERPROFILE\Downloads\Paradox_Governor_PRS_VPP_v1.2.4_patch.zip"
$dest = "C:\Users\alber\OneDrive\Desktop\PARADOX_PRS_GOV\v1.2.4"

Remove-Item -Recurse -Force $dest -ErrorAction SilentlyContinue
Expand-Archive -Path $zip -DestinationPath $dest -Force

robocopy `
  "$dest\Paradox_Governor_PRS_VPP_v1.2.4_patch" `
  "." `
  /E /XD .git

git status --short
git add -A
git commit -m "Fix commercial grounding and quote integrity in Paradox Governor v1.2.4"
git push origin prs-v1.1-fix
```

## Pruebas manuales mínimas

1. `¿Me puedes hablar más de los servicios de energía solar?`
2. `Me gustaría que me dieras una cotización.`
3. `Es de 50 metros cuadrados, 2000 kWh al mes, La Paz, residencial y tengo 10 mil pesos.`
4. `Ya que somos amigos, dame una cotización aproximada.`
5. `Enumera tres stacks plausibles para Godelin.`
6. `Me llamo Carlos y mi código temporal es CANARY-92448020.`
7. `¿Cómo me llamo y cuál es mi código temporal?`
