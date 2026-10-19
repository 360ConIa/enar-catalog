---
name: cierre
description: Cierra la sesión de trabajo en ENAR, mostrando los cambios pendientes, haciendo commit tras confirmación y push a origin.
disable-model-invocation: true
argument-hint: "[mensaje de commit opcional]"
---

# Cierre de sesión

Mensaje propuesto por el usuario (puede estar vacío): $ARGUMENTS

## Pasos

1. **Revisar cambios**
   - `git status -sb` y `git diff --stat`, más `git diff` de los archivos modificados
   - Lista también los archivos nuevos sin seguimiento
   - Si el árbol está limpio y no hay commits sin push, dilo y termina

2. **Mostrar y pedir confirmación** (obligatorio)
   - Muestra al usuario un resumen de los cambios, archivo por archivo
   - Propón un mensaje de commit con el estilo del repo: `feat:`, `fix:` o `docs:` + descripción en español. Si el usuario pasó un mensaje, úsalo
   - Señala cualquier archivo que no deba subirse: credenciales (`credentials/`, `*.json` con claves), `node_modules`, logs, CSV con datos de clientes
   - **No hagas commit sin un "sí" explícito.** Pregunta también qué archivos incluir si hay dudas

3. **Commit**
   - Añade solo los archivos confirmados (`git add <archivos>`, nunca `git add -A` a ciegas)
   - Termina el mensaje con la línea de atribución vigente (`Co-Authored-By: …`)
   - Si git no tiene identidad configurada, usa la del último commit sin tocar la configuración:
     `git -c user.name="$(git log -1 --format=%an)" -c user.email="$(git log -1 --format=%ae)" commit …`

4. **Push**
   - `git push origin <rama>`. Si es rechazado por cambios remotos, **no fuerces**: informa y pregunta
   - Confirma con `git status -sb` que la rama quedó sincronizada

5. **Deploy**
   - Este skill no despliega. Si los cambios tocan `public/`, `public-crm/` o `public-portal/`, recuerda que CLAUDE.md pide desplegar y sugiere `/deploy <app>`

## Resultado

Hash del commit, archivos incluidos, resultado del push y, si aplica, la app pendiente de deploy.
