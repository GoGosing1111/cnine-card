# Organization faction administrative map — 2026-10-15

The live map has 46 selectable regions: Seoul's 25 districts and the 21 cities/counties of southern Gyeonggi. All boundaries come from the **same KOSTAT 2013 nationwide topology** and share one north-up geographic projection and scale. Seoul is not enlarged or moved independently.

## Source and attribution

**통계청 통계지리정보서비스 제공** — administrative boundaries supplied by Statistics Korea's Statistical Geographic Information Service (SGIS), 2013 reference year.

- Original public-data conversion: [southkorea/southkorea-maps, KOSTAT 2013](https://github.com/southkorea/southkorea-maps/tree/master/kostat/2013)
- Exact source: [skorea_municipalities_topo_simple.json](https://raw.githubusercontent.com/southkorea/southkorea-maps/master/kostat/2013/json/skorea_municipalities_topo_simple.json)
- Repository contributor: Lucy Park / Team POPONG. The repository describes KOSTAT data as free to share or remix.
- Preserved SGIS administrator answer confirms reuse/processing has no license restriction and requests the source attribution above: [permission capture](https://github.com/southkorea/southkorea-maps/blob/master/license/kostat-20130213184448.png). The companion capture records the SGIS Q&A context.
- Source files are preserved in `assets/ui/organization/map-v2/`: `kostat-2013-municipalities-source.topojson`, `source-README.md`, `kostat-source-license-1.png`, and `kostat-source-license-2.png`. The generated map records the source SHA-256.
- No GADM data is used. The adjacent Apache `LICENSE` belongs to the earlier Seoul Maps asset history and is not substituted for the SGIS source terms.

## Processing and scope

`scripts/build-organization-faction-map.mjs` decodes the topology's quantized WGS84 coordinates, dissolves shared internal arcs for city-level regions, and projects every region together using an equirectangular projection with standard parallel 37.4° N. Subdistricts in Bucheon, Ansan, Anyang, Seongnam, Suwon, and Yongin are merged into one playable city each. Hwaseong remains one city-level game region; this map does not claim to represent its 2026 internal ward changes. The source is a simplified 2013 boundary dataset, not a cadastral or current administrative survey map.

The runtime output is `organization/faction/districts-v1.json`. Neighboring nonplayable geographic context is muted and cannot be selected. Commercial-area descriptions and economic rules are game data. The night-map illustration is decorative and remains separate from the true boundary layer; see `assets/ui/organization/war-v1/manifest.json`.

The rejected schematic hex map is retained only at `preview/organization-faction-v1/rejected-hex/districts-v1.json`. Its prior screenshots remain in `preview/organization-faction-v1/qa/`; no live module loads the rejected map. Current verified screenshots are in `preview/organization-faction-v2/qa/`.
