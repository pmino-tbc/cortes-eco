# cortes-eco

Aplicacion web para procesar archivos de picking, generar cortes por cliente y
mantener un historial de resultados listo para visualizar y exportar.

## Stack

- Next.js con `vinext`
- React 19
- TypeScript
- Drizzle y D1 opcionales
- Exportacion de Excel con `xlsx`

## Como correrlo en local

```bash
npm install
npm run dev
```

Para validar el build:

```bash
npm run build
```

## Estructura relevante

- `app/page.tsx`: interfaz principal del dashboard
- `app/api/history/route.ts`: historial y limpieza de registros
- `db/`: esquema y acceso a datos
- `public/`: logo y recursos visuales
- `tests/`: validaciones de salida renderizada

## Reglas activas para cargar datos

1. El usuario debe seleccionar el cliente o seller antes de procesar el archivo.
2. Los cortes se generan con la regla del seller elegido y respetan la prioridad definida.
3. No se deben subir secretos, `env` locales ni archivos de prueba al repo.

## Flujo de trabajo

1. Subir archivo Excel o CSV.
2. Elegir cliente, regla de orden y filtros especiales.
3. Revisar alertas de stock, parciales y pedidos bloqueados.
4. Exportar el resultado y, si aplica, guardar en historial.

## Comandos utiles

- `npm run dev`: levantar la app
- `npm run build`: verificar compilacion
- `npm test`: correr validacion automatica
- `git status`: ver cambios locales
- `git push origin main`: publicar cambios
