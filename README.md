# PEP V5.0.2 A7.0.14 DEV — Cruce semestral/trimestral/anual corregido

Corrección puntual del Planificador Inteligente.

- Reconoce `1ER SEMESTRE`, `2DO SEMESTRE`, trimestres y ANUAL antes de evaluar vencimiento.
- Compatibilidad con muestras históricas cuyos IDs de cliente/matriz quedaron antiguos: usa ID o nombre normalizado como llave de cruce.
- Ejemplo esperado: ALAVA GARCES / LUBROFRENOS FONS / RESIDUAL / `1ER SEMESTRE` / código 1368 debe cerrar S1 y no mostrarse Vencido.
- No modifica autenticación, Firebase, sincronización ni `src/app.js`.


## A7.0.21 — Actualización PWA instalada
- El Service Worker cambia de versión en cada release.
- La PWA comprueba actualizaciones al abrir, recuperar foco, volver a primer plano, recuperar conexión y cada 5 minutos.
- Si existe una versión nueva, muestra un aviso persistente “Nueva versión disponible”.
- “Actualizar ahora” activa el nuevo worker y recarga automáticamente.
- HTML, JS, service-worker.js y VERSION.txt se sirven sin caché.
