# Gift Lab — extensão do catálogo do CAOS Live

Módulo independente para observar uma live TikTok através do mesmo protocolo WebSocket usado pelo `Game`, separar descobertas de salvos e promover somente presentes completos ao catálogo verificado.

## Regras de segurança
- Descoberto: efêmero; pode ser apagado por “Limpar histórico”.
- Salvo: revisão independente; limpar descobertos não afeta este estado.
- Verificado: catálogo confiável; só aceita ID + nome + valor > 0 + URL de imagem.
- Salvar não significa catalogar.
- Um ID já verificado não volta para “Descobertos”.

## Rodar
`npm start` e abra `http://localhost:4173`.

## Testar
`npm run qa`

A lista base acompanha o schema `liveplus.verified-gifts.v1` e contém os 57 presentes fornecidos no último backup.
