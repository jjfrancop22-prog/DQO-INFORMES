# PEP Enterprise — Producción

Versión desplegable: **PEP V5.0.2-A7.0.37 PROD**
Build: **BUILD-A7037-PWA-UPDATE-FIX**

## Estructura de despliegue
Este paquete está preparado para publicarse DIRECTAMENTE en la raíz del repositorio GitHub/Netlify.

En la raíz deben quedar: `index.html`, `service-worker.js`, `manifest.webmanifest`, `netlify.toml`, `_headers`, `_redirects`, `VERSION.txt`, `README.md`, y las carpetas `src/`, `icons/`, `templates/`.

**No crear una carpeta `PEP_V5_...` dentro del repositorio.** Al usar GitHub > Add file > Upload files, descomprima este ZIP en su Mac y arrastre EL CONTENIDO interior a la raíz del repositorio, reemplazando los archivos existentes.

Las carpetas `src/`, `icons/` y `templates/` son parte normal de la aplicación. La cantidad de archivos del paquete corresponde a los módulos del ERP y no a versiones duplicadas.

## PWA
`service-worker.js` usa la versión A7.0.37, activa el nuevo worker inmediatamente y elimina cachés PEP anteriores. `index.html`, JavaScript y `VERSION.txt` se consultan con política orientada a detectar despliegues nuevos.
