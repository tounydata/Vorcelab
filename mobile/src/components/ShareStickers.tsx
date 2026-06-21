import { useMemo, useRef, useState } from 'react'
import { Modal, Pressable, Text, View } from 'react-native'
import { Image } from 'expo-image'
import { WebView } from 'react-native-webview'
import * as FileSystem from 'expo-file-system/legacy'
import * as Sharing from 'expo-sharing'
import {
  availableVariants, fmtStickerTime, VARIANT_LABELS, type StickerData, type StickerVariant,
} from '@/lib/shareSticker'
import { colors, radius } from '@/lib/theme'

// Modale de partage : les stickers PNG transparents sont dessinés au Canvas DANS une
// WebView (code identique au web, ../../src/lib/shareSticker), renvoyés en dataURL,
// puis partagés via la feuille de partage native (expo-sharing).

// Code Canvas porté 1:1 depuis src/lib/shareSticker.ts — exécuté dans la WebView.
const CANVAS_JS = String.raw`
var EMBER = '#c9a877', INK = '#0c0c0e';
var SANS = '-apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif';
var MONO = 'ui-monospace, Menlo, Consolas, monospace';
var W = 1080, N = 160;
function fmtStickerTime(totalS){var s=Math.max(0,Math.round(totalS));var h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sec=s%60;if(h>0)return[String(h),'H',String(m).padStart(2,'0')];return[String(m),"'",String(sec).padStart(2,'0')];}
function fmtKm(m){return (m/1000).toFixed(1).replace('.',',')+' KM';}
function shadowOn(ctx,blur){ctx.shadowColor='rgba(0,0,0,.55)';ctx.shadowBlur=blur||18;ctx.shadowOffsetY=4;}
function shadowOff(ctx){ctx.shadowColor='transparent';ctx.shadowBlur=0;ctx.shadowOffsetY=0;}
function drawSpaced(ctx,text,cx,y,spacing){var chars=[].concat(Array.from(text));var widths=chars.map(function(c){return ctx.measureText(c).width;});var total=widths.reduce(function(a,b){return a+b;},0)+spacing*(text.length-1);var x=cx-total/2;chars.forEach(function(c,i){ctx.fillText(c,x,y);x+=widths[i]+spacing;});}
function drawTime(ctx,parts,cx,y,size){ctx.font='900 '+size+'px '+SANS;ctx.textBaseline='alphabetic';var w=parts.map(function(p){return ctx.measureText(p).width;});var x=cx-(w[0]+w[1]+w[2])/2;shadowOn(ctx);ctx.fillStyle='#fff';ctx.fillText(parts[0],x,y);x+=w[0];ctx.fillStyle=EMBER;ctx.fillText(parts[1],x,y);x+=w[1];ctx.fillStyle='#fff';ctx.fillText(parts[2],x,y);shadowOff(ctx);}
function drawStats(ctx,d,cx,y,size){ctx.font='700 '+size+'px '+MONO;ctx.fillStyle='#fff';shadowOn(ctx,12);drawSpaced(ctx,fmtKm(d.distanceM)+'   +'+Math.round(d.dplusM)+' M',cx,y,size*0.06);shadowOff(ctx);}
var LOGO_PTS=[[3,44],[14,36],[22,40],[30,12],[38,30],[46,24],[57,32]];
function drawLogoMark(ctx,x,y,size){var s=size/60;shadowOn(ctx,8);ctx.strokeStyle='#fff';ctx.globalAlpha=0.3;ctx.lineWidth=1.2*s;ctx.beginPath();ctx.moveTo(x+3*s,y+50*s);ctx.lineTo(x+57*s,y+50*s);ctx.stroke();ctx.globalAlpha=1;ctx.strokeStyle='#fff';ctx.lineWidth=3.2*s;ctx.lineJoin='miter';ctx.lineCap='square';ctx.beginPath();LOGO_PTS.forEach(function(p,i){i?ctx.lineTo(x+p[0]*s,y+p[1]*s):ctx.moveTo(x+p[0]*s,y+p[1]*s);});ctx.stroke();ctx.strokeStyle=EMBER;ctx.lineWidth=1.8*s;ctx.beginPath();ctx.moveTo(x+30*s,y+50*s);ctx.lineTo(x+30*s,y+55*s);ctx.stroke();ctx.beginPath();ctx.arc(x+30*s,y+12*s,3.5*s,0,Math.PI*2);ctx.fillStyle=EMBER;ctx.fill();shadowOff(ctx);}
function drawBrand(ctx,cx,y,size){ctx.font='900 '+size+'px '+SANS;var word='VORCELAB';var spacing=size*0.26;var wordW=Array.from(word).reduce(function(a,c){return a+ctx.measureText(c).width;},0)+spacing*(word.length-1);var markS=size*1.55;var gap=size*0.4;var startX=cx-(markS+gap+wordW)/2;drawLogoMark(ctx,startX,y-size-markS*0.16,markS);ctx.fillStyle='#fff';shadowOn(ctx,8);drawSpaced(ctx,word,startX+markS+gap+wordW/2,y-size*0.06,spacing);shadowOff(ctx);}
function smooth(arr,r,passes){r=r||3;passes=passes||2;var out=arr.slice();for(var p=0;p<passes;p++){var next=out.slice();for(var i=0;i<out.length;i++){var a=Math.max(0,i-r),b=Math.min(out.length-1,i+r);var s=0;for(var j=a;j<=b;j++)s+=out[j];next[i]=s/(b-a+1);}out=next;}return out;}
function honestAltHeight(rangeM,maxPx){return Math.min(maxPx,Math.max(14,rangeM*1.4));}
function resampleRoute(latlng,altitude,n){var len=latlng.length;var midLat=latlng[Math.floor(len/2)][0]*Math.PI/180;var kx=Math.cos(midLat);var out=[];for(var i=0;i<n;i++){var idx=Math.min(len-1,Math.round((i/(n-1))*(len-1)));var lat=latlng[idx][0],lon=latlng[idx][1];out.push({x:lon*kx,y:-lat,alt:(altitude&&altitude[idx])||0});}var alts=smooth(out.map(function(p){return p.alt;}));return out.map(function(p,i){return{x:p.x,y:p.y,alt:alts[i]};});}
function fitBox(pts,w,h,stretch){var minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;for(var k=0;k<pts.length;k++){var p=pts[k];if(p.x<minX)minX=p.x;if(p.x>maxX)maxX=p.x;if(p.y<minY)minY=p.y;if(p.y>maxY)maxY=p.y;}var sx=w/Math.max(1e-9,maxX-minX),sy=h/Math.max(1e-9,maxY-minY);var kx=stretch?sx:Math.min(sx,sy);var ky=stretch?sy:Math.min(sx,sy);var ox=(w-(maxX-minX)*kx)/2,oy=(h-(maxY-minY)*ky)/2;return pts.map(function(p){return{x:ox+(p.x-minX)*kx,y:oy+(p.y-minY)*ky};});}
function strokePath(ctx,xy,color,width){ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle=INK;ctx.globalAlpha=0.5;ctx.lineWidth=width*1.9;ctx.beginPath();xy.forEach(function(p,i){i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y);});ctx.stroke();ctx.globalAlpha=1;ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();xy.forEach(function(p,i){i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y);});ctx.stroke();}
function dot(ctx,x,y,r,color){ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();ctx.lineWidth=r*0.45;ctx.strokeStyle=INK;ctx.stroke();}
function footer(ctx,d,timeSize,y){drawTime(ctx,fmtStickerTime(d.movingTimeS),W/2,y,timeSize);drawStats(ctx,d,W/2,y+timeSize*0.52,timeSize*0.24);drawBrand(ctx,W/2,y+timeSize*1.04,timeSize*0.3);return y+timeSize*1.3;}
function renderOn(h,draw){var c=document.createElement('canvas');c.width=W;c.height=h;var ctx=c.getContext('2d');ctx.clearRect(0,0,W,h);draw(ctx);return c;}
function renderSticker(variant,d){
  if(variant==='stats'){return renderOn(640,function(ctx){footer(ctx,d,230,250);});}
  if(variant==='trace'){return renderOn(1240,function(ctx){var pts=resampleRoute(d.latlng,d.altitude,N);var xy=fitBox(pts,W-240,660).map(function(p){return{x:p.x+120,y:p.y+70};});strokePath(ctx,xy,'#fff',16);dot(ctx,xy[0].x,xy[0].y,20,EMBER);footer(ctx,d,170,920);});}
  if(variant==='profile'){return renderOn(980,function(ctx){var len=d.altitude.length;var rawAlts=[],dists=[];for(var i=0;i<N;i++){var idx=Math.min(len-1,Math.round((i/(N-1))*(len-1)));rawAlts.push(d.altitude[idx]);dists.push(d.distance[idx]);}var alts=smooth(rawAlts);var pts=alts.map(function(a,i){return{x:dists[i],y:-a,alt:a};});var range=Math.max.apply(null,alts)-Math.min.apply(null,alts);var boxW=W-200,boxH=honestAltHeight(range,360);var offY=80+(360-boxH)/2;var xy=fitBox(pts,boxW,boxH,true).map(function(p){return{x:p.x+100,y:p.y+offY};});var bottom=80+boxH+40;var grad=ctx.createLinearGradient(0,80,0,bottom);grad.addColorStop(0,'rgba(201,168,119,.42)');grad.addColorStop(1,'rgba(201,168,119,.05)');ctx.beginPath();xy.forEach(function(p,i){i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y);});ctx.lineTo(xy[xy.length-1].x,bottom);ctx.lineTo(xy[0].x,bottom);ctx.closePath();ctx.fillStyle=grad;ctx.fill();strokePath(ctx,xy,EMBER,13);footer(ctx,d,170,690);});}
  return renderOn(1240,function(ctx){var pts=resampleRoute(d.latlng,d.altitude,N);var alts=pts.map(function(p){return p.alt;});var aMin=Math.min.apply(null,alts);var range=Math.max.apply(null,alts)-aMin;var altH=honestAltHeight(range,230);var left=150,right=W-150;var groundY=470;var xy=alts.map(function(a,i){return{x:left+((right-left)*i)/(N-1),y:groundY-18-((a-aMin)/Math.max(1,range))*altH};});var wall=ctx.createLinearGradient(0,groundY-altH-18,0,groundY);wall.addColorStop(0,'rgba(201,168,119,.24)');wall.addColorStop(1,'rgba(201,168,119,.04)');ctx.beginPath();xy.forEach(function(p,i){i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y);});ctx.lineTo(xy[xy.length-1].x,groundY);ctx.lineTo(xy[0].x,groundY);ctx.closePath();ctx.fillStyle=wall;ctx.fill();ctx.strokeStyle='rgba(255,255,255,.16)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(left,groundY);ctx.lineTo(right,groundY);ctx.stroke();strokePath(ctx,xy,EMBER,15);dot(ctx,xy[0].x,xy[0].y,18,EMBER);dot(ctx,xy[xy.length-1].x,xy[xy.length-1].y,18,'#4ad07a');var ground=fitBox(pts,right-left,120,true).map(function(g){return{x:left+g.x,y:540+g.y};});strokePath(ctx,ground,'#ffffff',6);dot(ctx,ground[0].x,ground[0].y,13,EMBER);footer(ctx,d,170,920);});
}
function post(variant){try{var c=renderSticker(variant,window.__DATA);var url=c.toDataURL('image/png');window.ReactNativeWebView.postMessage(JSON.stringify({variant:variant,dataUrl:url}));}catch(e){window.ReactNativeWebView.postMessage(JSON.stringify({variant:variant,error:String(e)}));}}
window.__render=post;
`

function buildHtml(data: StickerData, first: StickerVariant, all: StickerVariant[]): string {
  return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1.0" /><style>html,body{margin:0;background:transparent;}</style></head><body><script>
window.__DATA = ${JSON.stringify(data)};
${CANVAS_JS}
// pré-rend toutes les variantes (offscreen) → l'aperçu est instantané au changement.
var ALL = ${JSON.stringify(all)};
window.onload = function(){ ALL.forEach(function(v){ post(v); }); };
</script></body></html>`
}

export default function ShareStickers({ data, onClose }: { data: StickerData; onClose: () => void }) {
  const variants = useMemo(() => availableVariants(data), [data])
  const [variant, setVariant] = useState<StickerVariant>(variants[variants.length - 1] ?? 'stats')
  const [urls, setUrls] = useState<Partial<Record<StickerVariant, string>>>({})
  const [busy, setBusy] = useState(false)
  const webRef = useRef<WebView | null>(null)
  const html = useMemo(() => buildHtml(data, variant, variants), [data, variants]) // eslint-disable-line react-hooks/exhaustive-deps

  async function share() {
    const url = urls[variant]
    if (!url) return
    setBusy(true)
    try {
      const base64 = url.split(',')[1]
      const t = fmtStickerTime(data.movingTimeS).join('')
      const path = `${FileSystem.cacheDirectory}vorcelab-${t}-${variant}.png`
      await FileSystem.writeAsStringAsync(path, base64, { encoding: FileSystem.EncodingType.Base64 })
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(path, { mimeType: 'image/png', dialogTitle: 'Vorcelab' })
    } catch { /* annulé / indisponible */ }
    setBusy(false)
  }

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(10,10,12,0.65)', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <Pressable onPress={() => {}} style={{ width: '100%', maxWidth: 420, backgroundColor: colors.surf, borderWidth: 1, borderColor: colors.line2, borderTopWidth: 3, borderTopColor: colors.ember, borderRadius: radius.md, padding: 18 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <Text style={{ fontSize: 21, fontWeight: '800', color: colors.text }}>Partager en story</Text>
            <Pressable onPress={onClose} style={{ paddingVertical: 5, paddingHorizontal: 10, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.line2, backgroundColor: colors.surf2 }}>
              <Text style={{ color: colors.text2, fontSize: 12.8, fontWeight: '600' }}>Fermer</Text>
            </Pressable>
          </View>

          {/* sélecteur de variante */}
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            {variants.map((v) => {
              const on = v === variant
              return (
                <Pressable key={v} onPress={() => setVariant(v)}
                  style={{ paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1,
                    borderColor: on ? colors.ember : colors.line, backgroundColor: on ? 'rgba(214,128,62,0.16)' : colors.surf2 }}>
                  <Text style={{ fontSize: 11, letterSpacing: 0.88, color: on ? colors.ember : colors.text2 }}>{VARIANT_LABELS[v].toUpperCase()}</Text>
                </Pressable>
              )
            })}
          </View>

          {/* aperçu sur fond simulé (le PNG est transparent) */}
          <View style={{ borderRadius: radius.sm, overflow: 'hidden', backgroundColor: '#4a3a2e', minHeight: 280, alignItems: 'center', justifyContent: 'center', padding: 18 }}>
            {urls[variant] ? (
              <Image source={{ uri: urls[variant]! }} contentFit="contain" style={{ width: '100%', height: 360 }} />
            ) : (
              <Text style={{ fontSize: 11, color: '#fff' }}>Génération…</Text>
            )}
          </View>
          <Text style={{ fontSize: 11, color: colors.text3, marginTop: 8 }}>
            PNG transparent. Partager → « Enregistrer l'image » pour ta galerie, ou Instagram/WhatsApp pour une story.
          </Text>

          <Pressable onPress={share} disabled={busy || !urls[variant]}
            style={{ marginTop: 14, padding: 12, borderRadius: radius.sm, alignItems: 'center', backgroundColor: colors.ember, opacity: busy || !urls[variant] ? 0.6 : 1 }}>
            <Text style={{ fontWeight: '800', fontSize: 15, color: colors.bg }}>{busy ? '…' : 'Partager / Enregistrer'}</Text>
          </Pressable>

          {/* WebView offscreen : dessine les stickers au Canvas et renvoie les dataURL. */}
          <View style={{ width: 1, height: 1, opacity: 0, position: 'absolute' }} pointerEvents="none">
            <WebView
              ref={webRef}
              originWhitelist={['*']}
              source={{ html }}
              onMessage={(e) => {
                try {
                  const msg = JSON.parse(e.nativeEvent.data) as { variant: StickerVariant; dataUrl?: string }
                  if (msg.dataUrl) setUrls((prev) => ({ ...prev, [msg.variant]: msg.dataUrl }))
                } catch { /* ignore */ }
              }}
              style={{ width: 1, height: 1 }}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  )
}
