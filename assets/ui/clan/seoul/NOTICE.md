# Seoul district geometry

- Source: [southkorea/seoul-maps](https://github.com/southkorea/seoul-maps), KOSTAT 2013 simplified municipality GeoJSON.
- Repository contributor: Lucy Park. Repository-declared license: Apache 2.0; included in `LICENSE`.
- Original: https://raw.githubusercontent.com/southkorea/seoul-maps/master/kostat/2013/json/seoul_municipalities_geo_simple.json
- Source preserved as `districts-source.geojson`. `scripts/build-clan-seoul-map.mjs` projects the coordinates and calculates label centers; it maps district names to game IDs independently of the source's census codes.
- This is a stylized game map. Commercial-area names are game labels; income is a game rule, not economic/geographic data.
