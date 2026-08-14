# Plan de metricas tecnicas

## Proposito

Estas pruebas generan evidencia tecnica reproducible para evaluar el prototipo
DiabetesChain en un ambiente controlado. La medicion se enfoca en el backend y
la integracion blockchain, no en la interfaz web. Por esa razon k6 invoca la API
REST directamente y el backend conserva la responsabilidad de ejecutar MongoDB,
SQLite, Hyperledger Fabric y los servicios PRE.

## Escenarios

Los escenarios usan iteraciones compartidas para ejecutar una cantidad exacta
de operaciones. El numero de VUs controla la concurrencia aproximada; el numero
de registros u operaciones controla el volumen total.

| Escenario | Operaciones/registros | VUs sugeridos |
|---|---:|---:|
| E1 | 50 | 5 |
| E2 | 100 | 10 |
| E3 | 500 | 20 |
| E4 | 1000 | 30 |
| E5 | 2000 | 50 |

## Latencia de escritura

La latencia de escritura se mide sobre:

```text
POST /clinical-records/events/doctor
```

Esta operacion es representativa porque valida autenticacion JWT, rol de doctor,
firma del payload, permiso activo de escritura, scopes autorizados, existencia
de ScopeMaterial, escritura off-chain en MongoDB y registro del indice clinico
en Hyperledger Fabric mediante `RegisterClinicalRecordWithAudit`.

k6 registra la duracion HTTP total con `http_req_duration` y el trend
personalizado `write_latency_ms`. El backend registra el tramo Fabric en
`fabric_metrics.csv`.

## Latencia de lectura

La latencia de lectura se mide sobre:

```text
GET /clinical-records/history/:patientUsername
```

Esta operacion es representativa porque valida autenticacion JWT, rol
profesional, permiso activo de lectura, scopes autorizados, lectura de indices
clinicos con auditoria en Fabric, recuperacion de documentos cifrados off-chain
y transformacion de material de scope via PRE.

k6 registra la duracion HTTP total con `http_req_duration` y el trend
personalizado `read_latency_ms`.

## Confirmacion blockchain

La confirmacion de transacciones no se infiere solo desde k6. El backend mide el
tiempo alrededor de la llamada real:

```text
contract.submitTransaction(...)
```

La instrumentacion registra cada submit en:

```text
load-tests/results/fabric_metrics.csv
```

El CSV permite filtrar por `scenario` y `operation`. Las operaciones esperadas
incluyen:

- `RegisterClinicalRecordWithAudit`
- `GetHistoryByPatientPseudoIdWithAudit`
- `CreatePermissionWithAudit`
- `RevokePermissionWithAudit`
- `CreateScopeMaterial`

## Tasa de error

La tasa de error se obtiene por dos fuentes:

- k6: `http_req_failed`, `write_error_rate`, `read_error_rate`.
- Backend/Fabric CSV: filas con `status=ERROR`.

Para tesis, se recomienda reportar errores por escenario y explicar si se deben
a validaciones de negocio, dependencia no disponible, timeout de Fabric, PRE no
disponible o saturacion local.

## Throughput aproximado

El throughput aproximado se toma del resumen de k6:

- `iterations/s`: operaciones completas por segundo.
- `http_reqs/s`: solicitudes HTTP por segundo.

En estas pruebas cada iteracion corresponde a una operacion principal de lectura
o escritura, por lo que `iterations/s` es la medida mas directa.

## Precondiciones

Para lectura:

- Paciente existente.
- Profesional existente.
- Permiso activo con accion `read`.
- ScopeMaterial activo para los scopes consultados.
- Transform keys registradas en los nodos PRE.
- Al menos un registro clinico asociado al paciente.

Para escritura:

- Profesional con rol valido, por ejemplo `DOCTOR`.
- Paciente existente.
- Permiso activo con accion `write`.
- ScopeMaterial activo para el scope escrito.
- Payload clinico cifrado y firma valida del profesional.

Durante preparacion local se puede usar
`LOAD_TEST_BYPASS_CLINICAL_ACCESS=true` para medir el tramo de escritura
MongoDB + Fabric y lecturas tecnicas con auditoria Fabric antes de tener grants
y PRE completos. Esa medicion debe etiquetarse como corrida temporal con bypass
de permiso clinico, no como el flujo completo de soberania digital.

## Plantillas de resultados

### Latencia de escritura

| Escenario | Registros | VUs | Promedio ms | Mediana ms | P95 ms | Errores |
|---|---:|---:|---:|---:|---:|---:|
| E1 | 50 | 5 | | | | |
| E2 | 100 | 10 | | | | |
| E3 | 500 | 20 | | | | |
| E4 | 1000 | 30 | | | | |
| E5 | 2000 | 50 | | | | |

### Latencia de lectura

| Escenario | Operaciones de lectura | VUs | Promedio ms | Mediana ms | P95 ms | Errores |
|---|---:|---:|---:|---:|---:|---:|
| E1 | 50 | 5 | | | | |
| E2 | 100 | 10 | | | | |
| E3 | 500 | 20 | | | | |
| E4 | 1000 | 30 | | | | |
| E5 | 2000 | 50 | | | | |

### Confirmacion blockchain

| Escenario | Transacciones | Promedio ms | Mediana ms | P95 ms | Maximo ms | Errores |
|---|---:|---:|---:|---:|---:|---:|
| E1 | 50 | | | | | |
| E2 | 100 | | | | | |
| E3 | 500 | | | | | |
| E4 | 1000 | | | | | |
| E5 | 2000 | | | | | |

## Interpretacion recomendada

La interpretacion debe comparar el crecimiento de latencia y errores entre E1 y
E5. Un comportamiento defendible para un prototipo academico no requiere
latencias de produccion, pero si debe mostrar estabilidad razonable, trazabilidad
de fallos y una separacion clara entre latencia HTTP total y tiempo de
confirmacion Fabric.
