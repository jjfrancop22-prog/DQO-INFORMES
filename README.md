
## A7.0.29 — Consulta rápida de fecha máxima de informe
- En Registro de Muestras, el código es clicable para consultar la fecha máxima de emisión calculada por SLA.
- Muestra recepción de Laboratorio, tipo de servicio, analista, fecha máxima, estado del plazo, estado del informe y entrega real.
- La consulta es solo lectura y usa el mismo calendario de días laborables del sistema.
- Si la muestra aún no tiene ingreso oficial al Laboratorio, informa que la fecha máxima todavía no existe.

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


## A7.0.22 — Bimestres legibles y ciclos trimestral/semestral dinámicos
- BIMESTRAL se muestra y se registra como `1ER BIMESTRE` ... `6TO BIMESTRE`, manteniendo compatibilidad con históricos `B1` ... `B6`.
- CUATRIMESTRAL se normaliza visualmente como `1ER/2DO/3ER CUATRIMESTRE`, conservando compatibilidad con `C1/C2/C3`.
- TRIMESTRAL y SEMESTRAL recalculan la siguiente obligación desde el mes real del último período cumplido (`CONTINUAR`).
- Regla solicitada por Calidad: conteo inclusivo. Ejemplo: un semestral cumplido en mayo mueve el siguiente período a octubre.
- La fecha real de un trimestral/semestral no invalida la obligación por caer fuera del bloque calendario; el período declarado manda y la fecha real reprograma el siguiente ciclo.
- No modifica autenticación, Firebase, sincronización ni el núcleo de `src/app.js`.


## A7.0.23 — Registro de Muestras optimizado
- Registro de Muestras muestra 25 filas por página para reducir carga visual y del DOM.
- Búsqueda y filtros siguen trabajando sobre toda la base, no solo sobre la página visible.
- Búsqueda con pequeño debounce para evitar repintados en cada tecla.
- Excel descarga toda la base por defecto; solo los filtros de fecha Desde/Hasta limitan la exportación.
- Mantiene los demás filtros para consulta en pantalla sin reducir accidentalmente el Excel.


## A7.0.25 — Planificador con fechas programadas y alertas inteligentes
- Cada obligación pendiente de la matriz puede abrirse con clic para registrar una fecha programada de monitoreo, sin reemplazar la fecha límite contractual.
- La fecha se guarda dentro del plan del cliente (`scheduledDates`) y se mantiene al editar el catálogo.
- Los períodos con fecha manual aparecen en naranja como PLANIFICADOS hasta que exista una muestra que cierre la obligación.
- Campana inteligente en Planificador y contador visible en la pestaña: avisa 1 día antes de la fecha programada, el día programado, cuando una fecha programada pasó sin muestra, cuando vence la fecha límite sin planificación y cuando una DETENIDA requiere retoma pero aún no tiene fecha.
- Desde la campana puede programar, cambiar o quitar la fecha. Al resolverse la obligación, la alerta desaparece automáticamente.
- No se altera Firebase Auth, sincronización, módulos de informes/facturación ni la lógica de registro existente.


## A7.0.25 — Corrección de vencimiento por cierre de período
- TRIMESTRAL, SEMESTRAL y ANUAL vencen al último día real del mes correspondiente.
- 3ER TRIMESTRE vence 30/09; 4TO TRIMESTRE vence 31/12.
- La comparación de vencimiento usa fecha local YYYY-MM-DD para evitar falsos vencidos antes del límite.


## A7.0.26 — Corrección trimestral cada 3 meses
- TRIMESTRAL ahora desplaza el siguiente período exactamente +3 meses desde la toma real.
- Ejemplo: 2DO TRIMESTRE cumplido en junio -> 3ER TRIMESTRE corresponde a septiembre y vence al 30/09.
- Se mantiene la regla semestral inclusiva solicitada (mayo -> octubre).


## A7.0.27 — Planificar hoy + registro rápido
- Desde Planificador inteligente se agrega acción **⚡ Hoy** y, dentro de Programar monitoreo, **⚡ Planificar hoy y registrar**.
- Abre **Registrar nueva muestra** con cliente, sucursal, matriz sugerida, fecha de hoy y período/frecuencia precargados.
- El usuario revisa principalmente si requiere DQO/Tensoactivos.
- **Generar código y crear muestra** calcula el siguiente código numérico disponible del año y registra la muestra directamente en Registro de Análisis.
- El Planificador se actualiza y la obligación aparece **🟠 En análisis** con el código generado.
- Las retomas DETENIDAS conservan automáticamente la etiqueta 2DA/3RA/4TA TOMA correspondiente.
- Si el plan usa TODAS LAS MATRICES, se sugiere la matriz del último monitoreo compatible; si no existe histórico, usa RESIDUAL como respaldo.

## A7.0.28 — Código manual en registro rápido
- El flujo **⚡ Planificar hoy y registrar** mantiene cliente, sucursal, matriz, fecha y período/frecuencia precargados.
- El **Código manual** queda vacío, editable y con foco para que el usuario lo ingrese. El ERP no calcula ni propone códigos automáticamente.
- El botón rápido ahora se llama **💾 Guardar muestra**. Si el código está vacío, no permite guardar.
- El usuario revisa DQO/Tensoactivos y guarda; al registrarse correctamente, el Planificador vuelve y muestra la obligación **🟠 En análisis** con el código digitado por el usuario.


## A7.0.31 — Cierre de planificación cuando ya existe código
- Si una obligación ya tiene una muestra con código en Registro de Análisis (estado naranja), queda bloqueada para nueva planificación.
- Desaparecen `📅 Programar` y `⚡ Hoy` tanto en la matriz anual como en la tabla mensual.
- La celda muestra `🔒 Código registrado · esperando ingreso a Laboratorio`.
- La campana no genera alertas de planificación para obligaciones que ya tienen código en análisis.
- `openPlanningDate` y el guardado de fecha incorporan una validación defensiva para impedir duplicar la obligación aunque se intente abrir por otra vía.
