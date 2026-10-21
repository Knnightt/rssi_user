import React, {useCallback, useEffect, useRef, useState} from 'react';
import {View} from 'react-native';
import {WebView, WebViewMessageEvent} from 'react-native-webview';
import {FarmCoordinates} from '../location';
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
  accessibilityLabel: string;
};
const PickerWebView = WebView as unknown as React.ComponentType<PickerWebViewProps>;

/** An OpenStreetMap tile picker. A selected coordinate is returned only to the parent form. */
export function LocationPicker({
  value,
  onChange,
}: {
  value: FarmCoordinates | null;
  onChange: (coordinates: FarmCoordinates) => void;
}) {
  const webView = useRef<WebView | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [html] = useState(() => createPickerHtml(value));
  const latitude = value?.latitude;
  const longitude = value?.longitude;

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

  const handleMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const message = JSON.parse(event.nativeEvent.data) as {type?: string; latitude?: number; longitude?: number};
      if (message.type === 'ready') {
        setMapReady(true);
        return;
      }
      if (message.type === 'location' && Number.isFinite(message.latitude) && Number.isFinite(message.longitude)) {
        onChange({latitude: Number(message.latitude), longitude: Number(message.longitude)});
      }
    } catch {
      // Ignore malformed messages from the embedded map.
    }
  }, [onChange]);

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
        onLoadStart={() => setMapReady(false)}
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
#pin{position:absolute;z-index:3;width:25px;height:25px;display:none;background:#f04b32;border:3px solid #fff;border-radius:50% 50% 50% 0;box-shadow:0 2px 5px rgba(0,0,0,.3);transform:translate(-50%,-100%) rotate(-45deg);pointer-events:none}
#pin:after{content:'';position:absolute;width:7px;height:7px;border-radius:50%;background:#fff;left:6px;top:6px}
.zoom{position:absolute;right:10px;z-index:4;width:34px;height:34px;background:#fff;border:1px solid #b8c4cb;color:#26343c;font-size:22px;line-height:30px;text-align:center;border-radius:5px;box-shadow:0 1px 4px #87939a}.plus{top:10px}.minus{top:49px}
#attribution{position:absolute;right:4px;bottom:2px;z-index:4;padding:2px 4px;background:rgba(255,255,255,.8);font-size:9px;color:#39444a}
#tile-message{display:none;position:absolute;z-index:5;left:8px;right:52px;top:8px;padding:7px 9px;border-radius:5px;background:rgba(255,255,255,.94);font-size:11px;color:#46545b}
</style></head><body>
<div id="map" aria-label="Tap or drag to choose your farm location"><div id="tiles"></div><div id="pin"></div>
<button class="zoom plus" aria-label="Zoom in">+</button><button class="zoom minus" aria-label="Zoom out">−</button>
<div id="tile-message">Map tiles did not load. Check your internet connection.</div>
<div id="attribution">© OpenStreetMap contributors</div></div>
<script>
(function(){
  var map=document.getElementById('map');
  var layer=document.getElementById('tiles');
  var pin=document.getElementById('pin');
  var message=document.getElementById('tile-message');
  var center={lat:${latitude},lng:${longitude}};
  var zoom=${zoom};
  var selected=null;
  var drag=null;
  var dragged=false;
  var firstRender=true;
  var renderVersion=0;

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
  function placePin(){
    if(!selected){pin.style.display='none';return;}
    var c=project(center.lat,center.lng,zoom);
    var p=project(selected.lat,selected.lng,zoom);
    pin.style.left=(map.clientWidth/2+p.x-c.x)+'px';
    pin.style.top=(map.clientHeight/2+p.y-c.y)+'px';
    pin.style.display='block';
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
  function choose(clientX,clientY){
    var r=map.getBoundingClientRect();
    var c=project(center.lat,center.lng,zoom);
    var p=unproject(c.x+clientX-r.left-r.width/2,c.y+clientY-r.top-r.height/2,zoom);
    selected={lat:Number(p.lat.toFixed(7)),lng:Number(p.lng.toFixed(7))};
    placePin();
    if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(JSON.stringify({type:'location',latitude:selected.lat,longitude:selected.lng}));
  }
  map.addEventListener('click',function(e){
    if(dragged){dragged=false;return;}
    if(e.target.classList.contains('zoom'))return;
    choose(e.clientX,e.clientY);
  });
  map.addEventListener('touchstart',function(e){
    if(e.touches.length!==1)return;
    var t=e.touches[0],c=project(center.lat,center.lng,zoom);
    drag={x:t.clientX,y:t.clientY,cx:c.x,cy:c.y,dx:0,dy:0};dragged=false;
  },{passive:true});
  map.addEventListener('touchmove',function(e){
    if(!drag||e.touches.length!==1)return;
    var t=e.touches[0];drag.dx=t.clientX-drag.x;drag.dy=t.clientY-drag.y;
    if(Math.abs(drag.dx)+Math.abs(drag.dy)>6)dragged=true;
    layer.style.transform='translate('+drag.dx+'px,'+drag.dy+'px)';
    pin.style.marginLeft=drag.dx+'px';pin.style.marginTop=drag.dy+'px';
  },{passive:true});
  map.addEventListener('touchend',function(){
    if(drag&&dragged){
      var p=unproject(drag.cx-drag.dx,drag.cy-drag.dy,zoom);
      center={lat:p.lat,lng:p.lng};
      layer.style.transform='';pin.style.marginLeft='';pin.style.marginTop='';render();
    }
    drag=null;
  });
  document.querySelector('.plus').addEventListener('click',function(e){e.stopPropagation();zoom=Math.min(19,zoom+1);render();});
  document.querySelector('.minus').addEventListener('click',function(e){e.stopPropagation();zoom=Math.max(3,zoom-1);render();});
  window.addEventListener('resize',render);
  render();
})();
</script></body></html>`;
}
