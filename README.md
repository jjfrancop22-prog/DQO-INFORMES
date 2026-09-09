# PEP V5.0.2 A7.0.14 DEV — Cruce semestral/trimestral/anual corregido

Corrección puntual del Planificador Inteligente.

- Reconoce `1ER SEMESTRE`, `2DO SEMESTRE`, trimestres y ANUAL antes de evaluar vencimiento.
- Compatibilidad con muestras históricas cuyos IDs de cliente/matriz quedaron antiguos: usa ID o nombre normalizado como llave de cruce.
- Ejemplo esperado: ALAVA GARCES / LUBROFRENOS FONS / RESIDUAL / `1ER SEMESTRE` / código 1368 debe cerrar S1 y no mostrarse Vencido.
- No modifica autenticación, Firebase, sincronización ni `src/app.js`.
