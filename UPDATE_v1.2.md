# Actualización desde v1.1 a v1.2

1. Descomprime el paquete v1.2.
2. Copia su contenido sobre la raíz del repositorio local, conservando `.git`.
3. Verifica que Git detecte cambios.
4. Haz commit y push sobre la rama de Preview.
5. Prueba la Preview antes de fusionar con `main`.

Comandos recomendados en PowerShell:

```powershell
cd "C:\Users\alber\OneDrive\Desktop\PARADOX_PRS_GOV\paradox-local"

git checkout prs-v1.1-fix

$source = "C:\Users\alber\OneDrive\Desktop\PARADOX_PRS_GOV\repaired-v1.2\paradox-main-prs-v1.2"
robocopy $source . /E /XD .git

git status --short
git add -A
git commit -m "Upgrade Paradox Governor PRS-VPP to v1.2"
git push origin prs-v1.1-fix
```

No fusiones con `main` hasta validar la Preview.
