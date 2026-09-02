# Restricciones de horarios — Fase 1 (en curso)

Rama: `feature/restricciones-desplazamiento`. NO fusionar a main sin probar con una jornada real.

## Hecho (02-09-2026)
- **Regla maestra de desplazamiento (15-20 min).** Antes, dos partidos del mismo entrenador solo
  daban conflicto si se solapaban en hora. Ahora, si son en **campos distintos**, se exige un margen
  (`MARGEN_DESPLAZAMIENTO_MIN`, por defecto 20 min, guardable en localStorage `kolbe_margen_desplaz`).
  - Cambios en `calcConflictos()` (aviso de conflicto) y en `hayConflictoEnt()` (asignación automática).
  - Mismo campo → basta con no solapar (partidos seguidos OK). Campo distinto → margen obligatorio.

## Cómo probar (David, en tu entorno)
1. Importa una jornada real de Clupik.
2. Pon dos equipos del mismo entrenador en campos distintos a horas muy pegadas → debe marcar conflicto
   "necesita 20 min para desplazarse".
3. Pulsa "Asignar horarios" → no debe colocar a ese entrenador en dos campos sin margen.

## Pendiente Fase 1 (siguientes)
- Que el "no coincidir" de TODOS los clubes salga de la config entrenador→equipos (hoy ~10 clubes van a
  fuego dentro de `getEntrenadores`: Zola, Highlands, Everest, St. Michael, Fresnedillas, Quercus,
  Arenales, Zarzalejo, Unión Pardillo, Navalagamella).
- UI editable de restricciones por club (ventana de campo ya existe en "Campos y franjas").
- Fase 2: Fútbol Sala por sedes; matriz de desplazamiento entre campos (hoy el margen es único).
