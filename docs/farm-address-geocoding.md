# Farm address geocoding API contract

The mobile registration form sends one lookup request when the farmer leaves the completed address field. It does not submit the address to a third-party provider. The RSSI API should call Geoapify using a server-side API key and return a suggested coordinate; the farmer can then confirm or move the pin on the map.

## Request

`POST /api/v1/geocoding/farm-address`

```json
{
  "address": "Lot 12, Sitio Sample",
  "barangay": "Sample Barangay",
  "municipality": "Pamplona",
  "province": "Negros Oriental",
  "country": "Philippines"
}
```

This endpoint is called before registration, so it must not require an authenticated farmer token. Apply rate limits and input length limits. Keep `GEOAPIFY_API_KEY` on the server, avoid logging request addresses, and do not retain the raw address for geocoding longer than required. Query Geoapify with the country limited to the Philippines and use the selected province, municipality, and barangay to disambiguate the match. Return no match instead of a coordinate outside the selected area.

## Successful response

```json
{
  "latitude": 9.35,
  "longitude": 122.95,
  "formattedAddress": "Suggested address label",
  "confidence": 0.8
}
```

The `confidence` value may be `null` when the provider does not return one. The returned coordinate is a suggestion: rural addresses and farm plot names may not exist in the provider's address data. The map stays editable, and the app tells the farmer to verify the pin before registration.

Geoapify forward geocoding reference: https://apidocs.geoapify.com/docs/geocoding/forward-geocoding/
