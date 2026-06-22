import { useMemo, useRef } from 'react'
import { Pressable, Text, View } from 'react-native'
import { WebView } from 'react-native-webview'
import type { GpxPoint } from '@/lib/computeRaceProjection'
import type { ProfileMarker } from './ElevationProfile'
import { HEAT_COLORS, HEAT_NAMES } from '@/lib/raceStrategyView'
import { mapTiler3DConfig } from '@/lib/staticMap'
import { colors, radius } from '@/lib/theme'

interface HeatSeg { startKm: number; endKm: number; heat: number }
interface Props {
  points: GpxPoint[]
  markers: ProfileMarker[]
  heatSegments: HeatSeg[]
  cursorKm: number | null
  totalKm: number
  heightPx: number
}

// Carte 3D (MapLibre GL JS + terrain MapTiler) dans une WebView : tracé GPS drapé sur
// le relief en perspective, coloré par effort. Même rendu que le web. Repli : cadre sombre.
function buildHtml(points: GpxPoint[], markers: ProfileMarker[], heatSegments: HeatSeg[]): string | null {
  const cfg = mapTiler3DConfig()
  if (!cfg || points.length < 2) return null
  const simpleMarkers = markers.filter((m) => m.kind !== 'wall').map((m) => ({ km: m.km, kind: m.kind }))
  return `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css" />
<script src="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js"></script>
<style>html,body,#map{height:100%;margin:0;background:${colors.surf2};}</style>
</head><body><div id="map"></div><script>
var PTS = ${JSON.stringify(points.map((p) => [p.lon, p.lat]))};
var HEATS = ${JSON.stringify(heatSegments)};
var HEAT_COLORS = ${JSON.stringify(HEAT_COLORS)};
var MARKERS = ${JSON.stringify(simpleMarkers)};
function hav(a,b){var R=6371000,t=Math.PI/180;var dLat=(b[1]-a[1])*t,dLon=(b[0]-a[0])*t;var la1=a[1]*t,la2=b[1]*t;var x=Math.sin(dLat/2)*Math.sin(dLat/2)+Math.cos(la1)*Math.cos(la2)*Math.sin(dLon/2)*Math.sin(dLon/2);return 2*R*Math.asin(Math.sqrt(x));}
var cum=[0];for(var i=1;i<PTS.length;i++)cum.push(cum[i-1]+hav(PTS[i-1],PTS[i])/1000);
function llAtKm(km){var target=Math.max(0,Math.min(cum[cum.length-1],km));var i=1;while(i<cum.length&&cum[i]<target)i++;if(i>=PTS.length)return PTS[PTS.length-1];var a=PTS[i-1],b=PTS[i];var t=(target-cum[i-1])/Math.max(1e-6,cum[i]-cum[i-1]);return [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];}
function sliceCoords(a,b){var out=[];out.push(llAtKm(a));for(var i=0;i<PTS.length;i++){if(cum[i]>a&&cum[i]<b)out.push(PTS[i]);}out.push(llAtKm(b));return out;}
var minLon=Infinity,minLat=Infinity,maxLon=-Infinity,maxLat=-Infinity;
for(var k=0;k<PTS.length;k++){var p=PTS[k];if(p[0]<minLon)minLon=p[0];if(p[0]>maxLon)maxLon=p[0];if(p[1]<minLat)minLat=p[1];if(p[1]>maxLat)maxLat=p[1];}
var map=new maplibregl.Map({container:'map',style:${JSON.stringify(cfg.style)},center:[(minLon+maxLon)/2,(minLat+maxLat)/2],zoom:11,pitch:54,bearing:-18,scrollZoom:false,cooperativeGestures:true});
var cursor=null;
map.on('load',function(){
  map.addSource('dem',{type:'raster-dem',url:${JSON.stringify(cfg.terrain)}});
  map.setTerrain({source:'dem',exaggeration:2.5});
  try{map.setSky({'sky-color':'#0d1320','horizon-color':'#1d2738','fog-color':'#0c0c0e','sky-horizon-blend':0.5,'horizon-fog-blend':0.6});}catch(e){}
  map.addSource('route',{type:'geojson',data:{type:'Feature',properties:{},geometry:{type:'LineString',coordinates:PTS}}});
  map.addLayer({id:'route-casing',type:'line',source:'route',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#0c0c0e','line-width':7.5,'line-opacity':0.6}});
  var feats=(HEATS||[]).map(function(s){return {type:'Feature',properties:{color:HEAT_COLORS[s.heat]||'#E5562A'},geometry:{type:'LineString',coordinates:sliceCoords(s.startKm,s.endKm)}};}).filter(function(f){return f.geometry.coordinates.length>=2;});
  if(feats.length){map.addSource('route-heat',{type:'geojson',data:{type:'FeatureCollection',features:feats}});map.addLayer({id:'route-line',type:'line',source:'route-heat',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':['get','color'],'line-width':4}});}
  else{map.addLayer({id:'route-line',type:'line',source:'route',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#E5562A','line-width':3.6}});}
  map.fitBounds([[minLon,minLat],[maxLon,maxLat]],{padding:38,pitch:54,bearing:-18,duration:0,maxZoom:15});
  MARKERS.forEach(function(m){var ll=llAtKm(m.km);if(!ll)return;var ring=m.kind==='start'||m.kind==='finish';var c=m.kind==='finish'?'#4ad07a':m.kind==='start'?'#E5562A':'#ffffff';var el=document.createElement('div');el.style.cssText='width:'+(ring?11:8)+'px;height:'+(ring?11:8)+'px;border-radius:999px;background:'+c+';border:2px solid #0c0c0e;box-shadow:0 1px 4px rgba(0,0,0,.6)';new maplibregl.Marker({element:el}).setLngLat(ll).addTo(map);});
});
window.setCursor=function(km){if(km==null){if(cursor){cursor.remove();cursor=null;}return;}var ll=llAtKm(km);if(!ll)return;if(!cursor){var el=document.createElement('div');el.style.cssText='width:14px;height:14px;border-radius:999px;background:#4ad07a;border:2px solid #0c0c0e;box-shadow:0 0 0 5px rgba(74,208,122,.3)';cursor=new maplibregl.Marker({element:el}).setLngLat(ll).addTo(map);}else cursor.setLngLat(ll);};
window.rotate=function(deg){map.easeTo({bearing:map.getBearing()+deg,duration:350});};
window.reset=function(){map.easeTo({bearing:-18,pitch:54,duration:400});};
</script></body></html>`
}

export default function RouteMap3D({ points, markers, heatSegments, cursorKm, totalKm, heightPx }: Props) {
  const webRef = useRef<WebView | null>(null)
  const html = useMemo(() => buildHtml(points, markers, heatSegments), [points, markers, heatSegments])

  const cursorJs = useMemo(() => `window.setCursor&&window.setCursor(${cursorKm == null ? 'null' : cursorKm});true;`, [cursorKm])

  if (!html) {
    return (
      <View style={{ height: heightPx, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surf2, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: colors.text3, fontSize: 12 }}>Carte 3D indisponible (clé manquante).</Text>
      </View>
    )
  }

  return (
    <View style={{ height: heightPx, backgroundColor: colors.surf, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, overflow: 'hidden' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingTop: 12, paddingBottom: 8 }}>
        <Text style={{ fontSize: 11, letterSpacing: 2, color: colors.text3, fontWeight: '500' }}>TRACÉ GPS · 3D</Text>
        <Text style={{ fontSize: 9.5, color: colors.text3 }}>{totalKm.toFixed(1)} KM</Text>
      </View>
      <View style={{ flex: 1, marginHorizontal: 12, marginBottom: 12, borderRadius: radius.sm, overflow: 'hidden', position: 'relative' }}>
        <WebView
          ref={webRef}
          originWhitelist={['*']}
          source={{ html, baseUrl: 'https://tounydata.github.io' }}
          injectedJavaScript={cursorJs}
          onLoadEnd={() => webRef.current?.injectJavaScript(cursorJs)}
          style={{ flex: 1, backgroundColor: colors.surf2 }}
        />
        <View style={{ position: 'absolute', top: 8, right: 8, flexDirection: 'row', gap: 6 }}>
          {[{ l: '⟲', d: -40 }, { l: '⌂', d: 0 }, { l: '⟳', d: 40 }].map((b, i) => (
            <Pressable key={i} onPress={() => webRef.current?.injectJavaScript(b.d === 0 ? 'window.reset&&window.reset();true;' : `window.rotate&&window.rotate(${b.d});true;`)}
              style={{ width: 30, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 7, borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', backgroundColor: 'rgba(12,12,14,0.62)' }}>
              <Text style={{ color: '#e8e8ea', fontSize: b.d === 0 ? 13 : 16 }}>{b.l}</Text>
            </Pressable>
          ))}
        </View>
        {(heatSegments?.length ?? 0) > 0 ? (
          <View style={{ position: 'absolute', left: 6, bottom: 6, flexDirection: 'row', gap: 7, paddingVertical: 4, paddingHorizontal: 7, borderRadius: 6, backgroundColor: 'rgba(12,12,14,0.6)' }}>
            {[1, 2, 3, 4].map((h) => (
              <View key={h} style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: HEAT_COLORS[h] }} />
                <Text style={{ fontSize: 8, color: '#e8e8ea' }}>{HEAT_NAMES[h]}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  )
}
