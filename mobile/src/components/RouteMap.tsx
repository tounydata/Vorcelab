import { useMemo, useRef } from 'react'
import { View, type StyleProp, type ViewStyle } from 'react-native'
import { WebView } from 'react-native-webview'
import { reliefTileLayer } from '@/lib/staticMap'
import { colors } from '@/lib/theme'

// Carte de tracé GPS — WebView + Leaflet, rend EXACTEMENT la même carte que le web
// (fond relief MapTiler + filtre, repli OpenStreetMap, polyline ember). Le marqueur
// de survol est piloté par `hoverKm` via injectJavaScript (sync avec le profil d'alti).

function buildHtml(latlng: [number, number][]): string {
  const relief = reliefTileLayer()
  const tileLayerJs = relief
    ? `L.tileLayer(${JSON.stringify(relief.url)}, { attribution: ${JSON.stringify(relief.attribution)}, maxNativeZoom: ${relief.maxNativeZoom}, maxZoom: 19, className: 'vl-relief-tiles' }).addTo(map);`
    : `L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap', maxZoom: 19 }).addTo(map);`
  return `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
  html,body,#map{height:100%;margin:0;background:${colors.bg};}
  .vl-relief-tiles{filter:brightness(1.1) contrast(1.55) saturate(0.65);}
  .leaflet-control-attribution{font-size:9px;}
</style></head><body><div id="map"></div><script>
  var latlng = ${JSON.stringify(latlng)};
  var map = L.map('map', { zoomControl: true });
  ${tileLayerJs}
  var poly = L.polyline(latlng, { color: '#d6803e', weight: 3 }).addTo(map);
  map.fitBounds(poly.getBounds(), { padding: [20, 20] });
  var marker = null;
  window.setMarker = function(idx) {
    if (marker) { marker.remove(); marker = null; }
    if (idx == null || !latlng[idx]) return;
    marker = L.circleMarker(latlng[idx], { radius: 6, fillColor: '#fff', color: '#d6803e', weight: 2, fillOpacity: 1 }).addTo(map);
  };
</script></body></html>`
}

export default function RouteMap({
  latlng, hoverKm, distArr, height = 240, style,
}: {
  latlng: [number, number][]
  hoverKm?: number | null
  distArr?: number[]
  height?: number
  style?: StyleProp<ViewStyle>
}) {
  const webRef = useRef<WebView | null>(null)
  // L'HTML ne se reconstruit que si la trace change (pas à chaque survol).
  const html = useMemo(() => buildHtml(latlng), [latlng])

  // Survol → index le plus proche → déplace le marqueur dans la WebView.
  const markerJs = useMemo(() => {
    if (hoverKm == null || !distArr?.length) return 'window.setMarker && window.setMarker(null); true;'
    const hoverM = hoverKm * 1000
    let best = 0
    for (let i = 1; i < distArr.length; i++) {
      if (Math.abs(distArr[i] - hoverM) < Math.abs(distArr[best] - hoverM)) best = i
    }
    return `window.setMarker && window.setMarker(${best}); true;`
  }, [hoverKm, distArr])

  if (latlng.length < 2) return null

  return (
    <View style={[{ height, borderRadius: 6, overflow: 'hidden', backgroundColor: colors.surf2 }, style]}>
      <WebView
        ref={webRef}
        originWhitelist={['*']}
        source={{ html, baseUrl: 'https://tounydata.github.io' }}
        injectedJavaScript={markerJs}
        onLoadEnd={() => webRef.current?.injectJavaScript(markerJs)}
        style={{ flex: 1, backgroundColor: colors.bg }}
        scrollEnabled={false}
      />
    </View>
  )
}
