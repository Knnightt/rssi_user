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
  source: {html: string};
  style: typeof styles.locationPickerMap;
  originWhitelist: string[];
  javaScriptEnabled: boolean;
  domStorageEnabled: boolean;
  mixedContentMode: 'never';
  setSupportMultipleWindows: boolean;
  onMessage: (event: WebViewMessageEvent) => void;
  accessibilityLabel: string;
};
const PickerWebView = WebView as unknown as React.ComponentType<PickerWebViewProps>;

/** An OpenStreetMap picker. A selected coordinate is returned only to the parent form. */
export function LocationPicker({
  value,
  onChange,
}: {
  value: FarmCoordinates | null;
  onChange: (coordinates: FarmCoordinates) => void;
}) {
  const webView = useRef<WebView | null>(null);
  const ready = useRef(false);
  const [html] = useState(() => createPickerHtml(value));
  const latitude = value?.latitude;
  const longitude = value?.longitude;

  const updatePin = useCallback((coordinates: FarmCoordinates, moveMap: boolean) => {
    const lat = Number(coordinates.latitude);
    const lng = Number(coordinates.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    webView.current?.injectJavaScript(
      `window.setFarmPin && window.setFarmPin(${lat},${lng},${moveMap ? 'true' : 'false'}); true;`,
    );
  }, []);

  useEffect(() => {
    if (ready.current && latitude !== undefined && longitude !== undefined) {
      updatePin({latitude, longitude}, true);
    }
  }, [latitude, longitude, updatePin]);

  const handleMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const message = JSON.parse(event.nativeEvent.data) as {type?: string; latitude?: number; longitude?: number};
      if (message.type === 'ready') {
        ready.current = true;
        if (value) updatePin(value, false);
        return;
      }
      if (message.type === 'location' && Number.isFinite(message.latitude) && Number.isFinite(message.longitude)) {
        onChange({latitude: Number(message.latitude), longitude: Number(message.longitude)});
      }
    } catch {
      // Ignore malformed messages from the embedded map.
    }
  }, [onChange, updatePin, value]);

  return (
    <View style={styles.locationPickerFrame}>
      <PickerWebView
        ref={webView}
        source={{html}}
        style={styles.locationPickerMap}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        mixedContentMode="never"
        setSupportMultipleWindows={false}
        onMessage={handleMessage}
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
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<style>html,body,#map{height:100%;width:100%;margin:0;background:#dce9ed}.leaflet-control-attribution{font-size:8px!important}.leaflet-container{font:12px Arial,sans-serif}</style>
</head><body><div id="map" aria-label="Tap to select your farm location"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
(function(){
  const map=L.map('map',{zoomControl:true,attributionControl:true}).setView([${latitude},${longitude}],${zoom});
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(map);
  let pin=null;
  window.setFarmPin=function(lat,lng,moveMap){
    const point=[lat,lng];
    if(pin){pin.setLatLng(point);}else{pin=L.circleMarker(point,{radius:9,color:'#fff',weight:3,fillColor:'#2452e8',fillOpacity:1}).addTo(map);}
    if(moveMap){map.setView(point,Math.max(map.getZoom(),14));}
  };
  map.on('click',function(event){
    const lat=Number(event.latlng.lat.toFixed(7));
    const lng=Number(event.latlng.lng.toFixed(7));
    window.setFarmPin(lat,lng,false);
    if(window.ReactNativeWebView){window.ReactNativeWebView.postMessage(JSON.stringify({type:'location',latitude:lat,longitude:lng}));}
  });
  map.whenReady(function(){if(window.ReactNativeWebView){window.ReactNativeWebView.postMessage(JSON.stringify({type:'ready'}));}});
})();
</script></body></html>`;
}
