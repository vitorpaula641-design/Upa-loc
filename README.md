# Localização NFC

Site para compartilhar uma localização temporária com autorização do usuário.

## Rodar localmente
1. Instale Node.js 18+.
2. `npm install`
3. `npm start`
4. Abra `http://localhost:3000`

## Render
Suba esta pasta para um repositório GitHub e crie um Web Service no Render usando:
- Build: `npm install`
- Start: `npm start`

**Importante:** o SQLite local do exemplo é adequado para protótipo, mas o disco de um serviço web gratuito pode não ser persistente. Para produção, troque o SQLite por um banco persistente (por exemplo, Postgres) ou um disco persistente do Render.

O TTL padrão é 60 minutos e pode ser alterado pela variável `LOCATION_TTL_MINUTES`.

O site usa Leaflet + OpenStreetMap para o mapa.
