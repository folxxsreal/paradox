# Diagnóstico del HTTP 500

El proyecto recibido tenía `api/chat.js` importando:

```js
from "./paradox-governor/governor.js";
```

pero la carpeta `api/paradox-governor/` no existía. Solo estaba la carpeta heredada `api/akuma/`.

Por eso Vercel fallaba al cargar la función antes de ejecutar el handler y devolvía HTTP 500 incluso para `hola`.

Este paquete añade la carpeta faltante y reemplaza `api/chat.js` por la versión PRS-VPP v1.1 compatible.
