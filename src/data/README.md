# Negros location choices

`negrosLocations.json` contains the province → municipality/city → barangay hierarchy for the two provinces offered in farmer registration. The app bundles this list so the dropdowns work offline and never send typed location names that do not match the selected administrative area.

The list was retrieved from the PSGC Cloud v2 API on 2026-10-21. To refresh it, run `node scripts/updateNegrosLocations.cjs` from the repository root. The data refresh script groups barangays by the municipality's PSGC code and writes the bundled JSON.

Source API documentation: https://psgc.cloud/api-docs/v2
