# Memory

## Proyecto

Nombre: `cortes-eco`

Objetivo: procesar picking por cliente, generar cortes, detectar alertas de stock y mantener historial para busqueda y limpieza.

## Reglas operativas

- Primero se elige el cliente o seller.
- Luego se aplica la regla de corte correspondiente a ese cliente.
- Si hay stock cero en una fila, el pedido puede marcarse como parcial o sin stock segun el caso.

## Convenciones

- No subir secretos ni archivos `.env`.
- Mantener `main` limpio y publicar solo con cambios verificados.
- Usar mensajes de commit claros y descriptivos.

## Estado actual

- Repo remoto: `https://github.com/pmino-tbc/cortes-eco`
- Branch principal: `main`
- App basada en `vinext` con historial local/DB y exportacion a Excel
