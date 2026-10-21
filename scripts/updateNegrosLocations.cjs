const fs = require('fs');

const provinces = ['Negros Oriental', 'Negros Occidental'];
const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function fetchPsgcJson(url) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(url, {
      headers: {'User-Agent': 'RSSI-farmer-app-location-list/1.0'},
    });

    if (response.ok) return response.json();
    if (response.status !== 429 && response.status < 500) {
      throw new Error(`PSGC request failed (${response.status}): ${url}`);
    }
    await pause(500 * (attempt + 1));
  }

  throw new Error(`PSGC request failed after retries: ${url}`);
}

async function updateLocationData() {
  const locations = {};

  for (const province of provinces) {
    const municipalities = (await fetchPsgcJson(
      `https://psgc.cloud/api/v2/provinces/${encodeURIComponent(province)}/cities-municipalities`,
    )).data;
    const records = [];

    for (let index = 0; index < municipalities.length; index += 8) {
      const batch = municipalities.slice(index, index + 8);
      const results = await Promise.all(batch.map(async municipality => {
        const barangays = (await fetchPsgcJson(
          `https://psgc.cloud/api/v2/cities-municipalities/${municipality.code}/barangays`,
        )).data;

        return {
          name: municipality.name.trim(),
          barangays: barangays.map(barangay => barangay.name.trim()).sort((a, b) => a.localeCompare(b)),
        };
      }));

      records.push(...results);
    }

    locations[province] = records.sort((a, b) => a.name.localeCompare(b.name));
  }

  fs.writeFileSync(
    'src/data/negrosLocations.json',
    `${JSON.stringify(locations)}\n`,
  );

  for (const [province, records] of Object.entries(locations)) {
    const barangayCount = records.reduce((count, municipality) => count + municipality.barangays.length, 0);
    console.log(`${province}: ${records.length} municipalities/cities, ${barangayCount} barangays`);
  }
}

updateLocationData().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
