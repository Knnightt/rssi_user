import React, {useCallback, useEffect, useRef, useState} from 'react';
import {View} from 'react-native';
import {WebView, WebViewMessageEvent} from 'react-native-webview';
import {FarmBoundaryPoint, FarmCoordinates} from '../location';
import {styles} from '../theme';

const NEGROS_CENTER: FarmCoordinates = {latitude: 9.35, longitude: 122.95};

// react-native-webview 14 currently exposes incompatible platform-specific JSX
// prop intersections under the project's React Native/TypeScript versions.
type PickerWebViewProps = {
  ref?: React.Ref<WebView>;
  source: {html: string; baseUrl?: string};
  style: typeof styles.locationPickerMap;
  originWhitelist: string[];
  javaScriptEnabled: boolean;
  domStorageEnabled: boolean;
  mixedContentMode: 'never';
  setSupportMultipleWindows: boolean;
  onMessage: (event: WebViewMessageEvent) => void;
  onLoadStart: () => void;
  scrollEnabled: boolean;
  accessibilityLabel: string;
};
const PickerWebView = WebView as unknown as React.ComponentType<PickerWebViewProps>;

/** An OpenStreetMap tile picker. A selected coordinate is returned only to the parent form. */
export function LocationPicker({
  value,
  onChange,
  boundary = [],
  boundaryDrawing = false,
  onBoundaryChange,
  onGestureActive,
}: {
  value: FarmCoordinates | null;
  onChange: (coordinates: FarmCoordinates) => void;
  boundary?: FarmBoundaryPoint[];
  boundaryDrawing?: boolean;
  onBoundaryChange?: (points: FarmBoundaryPoint[]) => void;
  onGestureActive?: (active: boolean) => void;
}) {
  const webView = useRef<WebView | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [html] = useState(() => createPickerHtml(value));
  const latitude = value?.latitude;
  const longitude = value?.longitude;
  const boundaryJson = JSON.stringify(boundary);

  const updatePin = useCallback((coordinates: FarmCoordinates | null) => {
    if (!coordinates) {
      webView.current?.injectJavaScript('window.clearFarmPin && window.clearFarmPin(); true;');
      return;
    }
    const lat = Number(coordinates.latitude);
    const lng = Number(coordinates.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    webView.current?.injectJavaScript(
      `window.setFarmPin && window.setFarmPin(${lat},${lng},true); true;`,
    );
  }, []);

  useEffect(() => {
    if (!mapReady) return;
    updatePin(latitude !== undefined && longitude !== undefined ? {latitude, longitude} : null);
  }, [latitude, longitude, mapReady, updatePin]);

  useEffect(() => {
    if (!mapReady) return;
    webView.current?.injectJavaScript(
      `window.setFarmBoundary && window.setFarmBoundary(${boundaryJson}); true;`,
    );
  }, [boundaryJson, mapReady]);

  useEffect(() => {
    if (!mapReady) return;
    webView.current?.injectJavaScript(
      `window.setBoundaryDrawing && window.setBoundaryDrawing(${boundaryDrawing ? 'true' : 'false'}); true;`,
    );
  }, [boundaryDrawing, mapReady]);

  const handleMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const message = JSON.parse(event.nativeEvent.data) as {type?: string; latitude?: number; longitude?: number; active?: boolean; points?: FarmBoundaryPoint[]};
      if (message.type === 'ready') {
        setMapReady(true);
        return;
      }
      if (message.type === 'gesture') {
        onGestureActive?.(message.active === true);
        return;
      }
      if (message.type === 'location' && Number.isFinite(message.latitude) && Number.isFinite(message.longitude)) {
        onChange({latitude: Number(message.latitude), longitude: Number(message.longitude), source: 'manual'});
      }
      if (message.type === 'boundary' && Array.isArray(message.points)) {
        const points = message.points.filter(point => Number.isFinite(point.latitude) && Number.isFinite(point.longitude));
        onBoundaryChange?.(points);
      }
    } catch {
      // Ignore malformed messages from the embedded map.
    }
  }, [onBoundaryChange, onChange, onGestureActive]);

  return (
    <View style={styles.locationPickerFrame}>
      <PickerWebView
        ref={webView}
        source={{html, baseUrl: 'https://www.openstreetmap.org/'}}
        style={styles.locationPickerMap}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        mixedContentMode="never"
        setSupportMultipleWindows={false}
        onMessage={handleMessage}
        onLoadStart={() => {setMapReady(false); onGestureActive?.(false);}}
        scrollEnabled={false}
        accessibilityLabel="Interactive farm location map"
      />
    </View>
  );
}

function createPickerHtml(value: FarmCoordinates | null): string {
  const center = value || NEGROS_CENTER;
  const latitude = Number.isFinite(center.latitude) ? center.latitude : NEGROS_CENTER.latitude;
  const longitude = Number.isFinite(center.longitude) ? center.longitude : NEGROS_CENTER.longitude;
  const zoom = value ? 14 : 8;
  return `<!doctype html>
<html><head><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<style>
html,body,#map{height:100%;width:100%;margin:0;overflow:hidden;background:#dce9ed;font:13px Arial,sans-serif;touch-action:none}
#tiles{position:absolute;inset:0;overflow:hidden}.tile{position:absolute;width:256px;height:256px;max-width:none;user-select:none;-webkit-user-drag:none}
#boundary{position:absolute;inset:0;width:100%;height:100%;z-index:2;overflow:visible;pointer-events:none}
#boundary polygon{fill:rgba(37,99,235,.22);stroke:#2563eb;stroke-width:3;vector-effect:non-scaling-stroke}
#boundary polyline{fill:none;stroke:#2563eb;stroke-width:3;vector-effect:non-scaling-stroke}
#boundary circle{fill:#2563eb;stroke:#fff;stroke-width:2;vector-effect:non-scaling-stroke}
#pin{position:absolute;z-index:3;width:25px;height:25px;display:none;background:#f04b32;border:3px solid #fff;border-radius:50% 50% 50% 0;box-shadow:0 2px 5px rgba(0,0,0,.3);transform:translate(-50%,-100%) rotate(-45deg);pointer-events:none}
#pin:after{content:'';position:absolute;width:7px;height:7px;border-radius:50%;background:#fff;left:6px;top:6px}
.zoom{position:absolute;right:10px;z-index:4;width:34px;height:34px;background:#fff;border:1px solid #b8c4cb;color:#26343c;font-size:22px;line-height:30px;text-align:center;border-radius:5px;box-shadow:0 1px 4px #87939a}.plus{top:10px}.minus{top:49px}
#attribution{position:absolute;right:4px;bottom:2px;z-index:4;padding:2px 4px;background:rgba(255,255,255,.8);font-size:9px;color:#39444a}
#tile-message{display:none;position:absolute;z-index:5;left:8px;right:52px;top:8px;padding:7px 9px;border-radius:5px;background:rgba(255,255,255,.94);font-size:11px;color:#46545b}
</style></head><body>
<div id="map" aria-label="Drag with one finger to pan. Pinch with two fingers to zoom. Tap to place the farm pin or add boundary corners while drawing."><div id="tiles"></div><svg id="boundary" aria-hidden="true"></svg><div id="pin"></div>
<button class="zoom plus" aria-label="Zoom in">+</button><button class="zoom minus" aria-label="Zoom out">−</button>
<div id="tile-message">Map tiles did not load. Check your internet connection.</div>
<div id="attribution">© OpenStreetMap contributors</div></div>
<script>
(function(){
  var map=document.getElementById('map');
  var layer=document.getElementById('tiles');
  var boundaryLayer=document.getElementById('boundary');
  var pin=document.getElementById('pin');
  var message=document.getElementById('tile-message');
  var center={lat:${latitude},lng:${longitude}};
  var zoom=${zoom};
  var selected=null;
  var boundary=[];
  var boundaryDrawing=false;
  var drag=null;
  var firstRender=true;
  var renderVersion=0;
  var ignoreNextClickUntil=0;

  function project(lat,lng,level){
    var scale=256*Math.pow(2,level);
    var sin=Math.sin(lat*Math.PI/180);
    return {x:(lng+180)/360*scale,y:(0.5-Math.log((1+sin)/(1-sin))/(4*Math.PI))*scale};
  }
  function unproject(x,y,level){
    var scale=256*Math.pow(2,level);
    var n=Math.PI-2*Math.PI*y/scale;
    return {lat:180/Math.PI*Math.atan(0.5*(Math.exp(n)-Math.exp(-n))),lng:x/scale*360-180};
  }
  function touchDistance(touches){
    var dx=touches[0].clientX-touches[1].clientX;
    var dy=touches[0].clientY-touches[1].clientY;
    return Math.sqrt(dx*dx+dy*dy);
  }
  function placePin(){
    if(!selected){pin.style.display='none';return;}
    pin.style.left=(map.clientWidth/2)+'px';
    pin.style.top=(map.clientHeight/2)+'px';
    pin.style.display='block';
  }
  function drawBoundary(){
    boundaryLayer.innerHTML='';
    if(boundary.length===0)return;
    var centerPoint=project(center.lat,center.lng,zoom);
    var screenPoints=boundary.map(function(point){
      var p=project(point.latitude,point.longitude,zoom);
      return {x:p.x-centerPoint.x+map.clientWidth/2,y:p.y-centerPoint.y+map.clientHeight/2};
    });
    var values=screenPoints.map(function(point){return point.x+','+point.y;}).join(' ');
    if(boundary.length>=3){
      var polygon=document.createElementNS('http://www.w3.org/2000/svg','polygon');
      polygon.setAttribute('points',values);boundaryLayer.appendChild(polygon);
    }else if(boundary.length>=2){
      var line=document.createElementNS('http://www.w3.org/2000/svg','polyline');
      line.setAttribute('points',values);boundaryLayer.appendChild(line);
    }
    screenPoints.forEach(function(point){
      var dot=document.createElementNS('http://www.w3.org/2000/svg','circle');
      dot.setAttribute('cx',String(point.x));dot.setAttribute('cy',String(point.y));dot.setAttribute('r','6');boundaryLayer.appendChild(dot);
    });
  }
  function render(){
    var version=++renderVersion;
    var w=map.clientWidth,h=map.clientHeight;
    var c=project(center.lat,center.lng,zoom);
    var left=c.x-w/2,top=c.y-h/2,n=Math.pow(2,zoom);
    var minX=Math.floor(left/256),maxX=Math.floor((left+w)/256);
    var minY=Math.floor(top/256),maxY=Math.floor((top+h)/256);
    var total=0,loaded=0,failed=0;
    layer.innerHTML='';
    message.style.display='none';
    for(var y=minY;y<=maxY;y++){
      if(y<0||y>=n)continue;
      for(var x=minX;x<=maxX;x++){
        total++;
        var wrappedX=((x%n)+n)%n;
        var img=document.createElement('img');
        img.className='tile';img.alt='';img.draggable=false;
        img.style.left=(x*256-left)+'px';img.style.top=(y*256-top)+'px';
        img.onload=function(){if(version!==renderVersion)return;loaded++;if(loaded>0)message.style.display='none';};
        img.onerror=function(){if(version!==renderVersion)return;failed++;if(failed===total&&loaded===0)message.style.display='block';};
        img.src='https://tile.openstreetmap.org/'+zoom+'/'+wrappedX+'/'+y+'.png';
        layer.appendChild(img);
      }
    }
    placePin();
    drawBoundary();
    if(firstRender){
      firstRender=false;
      if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(JSON.stringify({type:'ready'}));
    }
  }
  window.setFarmPin=function(lat,lng,moveMap){
    selected={lat:lat,lng:lng};
    if(moveMap){center={lat:lat,lng:lng};zoom=Math.max(zoom,14);render();}
    else placePin();
  };
  window.clearFarmPin=function(){selected=null;placePin();};
  window.setFarmBoundary=function(points){
    boundary=Array.isArray(points)?points.filter(function(point){return point&&Number.isFinite(Number(point.latitude))&&Number.isFinite(Number(point.longitude));}).map(function(point){return {latitude:Number(point.latitude),longitude:Number(point.longitude)};}):[];
    drawBoundary();
  };
  window.setBoundaryDrawing=function(active){boundaryDrawing=active===true;map.style.cursor=boundaryDrawing?'crosshair':'grab';};
  map.addEventListener('click',function(e){
    if(Date.now()<ignoreNextClickUntil){ignoreNextClickUntil=0;return;}
    if(e.target.closest('.zoom'))return;
    var rect=map.getBoundingClientRect();
    var c=project(center.lat,center.lng,zoom);
    var point=unproject(c.x+e.clientX-rect.left-map.clientWidth/2,
      c.y+e.clientY-rect.top-map.clientHeight/2,zoom);
    if(boundaryDrawing){
      boundary.push({latitude:Number(point.lat.toFixed(7)),longitude:Number(point.lng.toFixed(7))});
      drawBoundary();
      if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(JSON.stringify({type:'boundary',points:boundary}));
      return;
    }
    center={lat:Number(point.lat.toFixed(7)),lng:Number(point.lng.toFixed(7))};
    selected={lat:center.lat,lng:center.lng};
    zoom=Math.max(14,zoom);
    render();
    if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(JSON.stringify({type:'location',latitude:center.lat,longitude:center.lng}));
  });
  map.addEventListener('touchstart',function(e){
    if(e.touches.length===1){
      var touch=e.touches[0];
      drag={mode:'pan',x:touch.clientX,y:touch.clientY,dx:0,dy:0,startZoom:zoom};
      if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(JSON.stringify({type:'gesture',active:true}));
      return;
    }
    if(e.touches.length!==2)return;
    e.preventDefault();
    e.stopPropagation();
    var distance=touchDistance(e.touches);
    drag={mode:'pinch',startZoom:zoom,nextZoom:zoom,startDistance:distance};
    if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(JSON.stringify({type:'gesture',active:true}));
  },{passive:false,capture:true});
  map.addEventListener('touchmove',function(e){
    if(!drag)return;
    if(drag.mode==='pan'&&e.touches.length===1){
      e.preventDefault();
      e.stopPropagation();
      drag.dx=e.touches[0].clientX-drag.x;
      drag.dy=e.touches[0].clientY-drag.y;
      layer.style.transform='translate('+drag.dx+'px,'+drag.dy+'px)';
      return;
    }
    if(drag.mode!=='pinch'||e.touches.length!==2)return;
    e.preventDefault();
    e.stopPropagation();
    var distance=touchDistance(e.touches);
    var scale=distance>0&&drag.startDistance>0?distance/drag.startDistance:1;
    drag.nextZoom=Math.max(3,Math.min(19,Math.round(drag.startZoom+Math.log(scale)/Math.LN2)));
    var visualScale=Math.pow(2,drag.nextZoom-drag.startZoom);
    layer.style.transformOrigin=(map.clientWidth/2)+'px '+(map.clientHeight/2)+'px';
    layer.style.transform='scale('+visualScale+')';
  },{passive:false,capture:true});
  map.addEventListener('touchend',function(e){
    if(drag&&((drag.mode==='pan'&&e.touches.length===0)||(drag.mode==='pinch'&&e.touches.length<2))){
      if(drag.mode==='pan'){
        var moved=Math.abs(drag.dx)+Math.abs(drag.dy)>3;
        if(moved){
          e.preventDefault();
          e.stopPropagation();
          var c=project(center.lat,center.lng,zoom);
          var p=unproject(c.x-drag.dx,c.y-drag.dy,zoom);
          center={lat:Number(p.lat.toFixed(7)),lng:Number(p.lng.toFixed(7))};
          selected={lat:center.lat,lng:center.lng};
          ignoreNextClickUntil=Date.now()+450;
        }
      }else{
        e.preventDefault();
        e.stopPropagation();
        zoom=drag.nextZoom;
        ignoreNextClickUntil=Date.now()+450;
      }
      layer.style.transform='';layer.style.transformOrigin='';render();
      if(drag.mode==='pan'&&moved&&window.ReactNativeWebView)window.ReactNativeWebView.postMessage(JSON.stringify({type:'location',latitude:center.lat,longitude:center.lng}));
      if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(JSON.stringify({type:'gesture',active:false}));
      drag=null;
    }
  },{passive:false,capture:true});
  map.addEventListener('touchcancel',function(){drag=null;layer.style.transform='';layer.style.transformOrigin='';render();if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(JSON.stringify({type:'gesture',active:false}));});
  document.querySelector('.plus').addEventListener('click',function(e){e.stopPropagation();zoom=Math.min(19,zoom+1);render();});
  document.querySelector('.minus').addEventListener('click',function(e){e.stopPropagation();zoom=Math.max(3,zoom-1);render();});
  window.addEventListener('resize',render);
  render();
})();
</script></body></html>`;
}
