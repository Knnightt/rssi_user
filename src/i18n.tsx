import React, {createContext, useCallback, useContext, useEffect, useMemo, useState} from 'react';
import {Text as NativeText, TextProps} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type Language = 'en' | 'tl';
type Translator = (value: string) => string;
type LanguageContextValue = {language: Language; setLanguage: (value: Language) => Promise<void>; t: Translator};

const languageStorageKey = 'rssi_app_language';

const tagalog: Record<string, string> = {
  'Dashboard': 'Dashboard', 'Map coverage': 'Saklaw ng mapa', 'Submit report': 'Magsumite ng ulat',
  'My submitted reports': 'Mga isinumite kong ulat', 'Updates': 'Mga update', 'My farm': 'Aking sakahan',
  'My profile': 'Aking profile', 'Help & support': 'Tulong at suporta',
  'Home': 'Home', 'Map': 'Mapa', 'Report': 'Ulat', 'History': 'Kasaysayan', 'New report': 'Bagong ulat',
  'RSSI FARMER MONITORING': 'PAGSUBAYBAY NG RSSI PARA SA MAGSASAKA',
  'RSSI MONITORING · Farmer observations are subject to SRA review': 'PAGSUBAYBAY NG RSSI · Susuriin ng SRA ang mga obserbasyon ng magsasaka',
  'Offline mode · saved reports will sync automatically': 'Offline · awtomatikong isi-sync ang mga naka-save na ulat',
  'Network available · reconnecting to RSSI server': 'May network · muling kumokonekta sa RSSI server',
  'Tap to dismiss': 'I-tap para isara', 'Welcome back, ': 'Maligayang pagbabalik, ',
  '. Track your farms and field observations.': '. Subaybayan ang iyong mga sakahan at obserbasyon sa bukid.',
  'Search farms, barangays, or reports…': 'Maghanap ng sakahan, barangay, o ulat…',
  'Search farms and reports': 'Maghanap ng sakahan at mga ulat', 'Search results': 'Mga resulta ng paghahanap',
  'Clear': 'I-clear', 'No matches': 'Walang tugma', 'Try a farm name, municipality, or report code.': 'Subukan ang pangalan ng sakahan, munisipalidad, o code ng ulat.',
  'Coverage': 'Saklaw', 'Active reports': 'Mga aktibong ulat', 'Last sync': 'Huling pag-sync', 'Live': 'Live', 'Offline': 'Offline',
  'Connected': 'Konektado', 'Server checking': 'Sinusuri ang server', 'Offline mode': 'Offline',
  'Your farm and report details are up to date.': 'Bago ang impormasyon ng iyong sakahan at mga ulat.',
  'Your network is available. Checking your RSSI server…': 'May koneksyon sa network. Sinusuri ang RSSI server…',
  'Saved farm details and your report drafts stay available offline.': 'Mananatiling available offline ang mga detalye ng sakahan at draft ng ulat.',
  'Syncing reports…': 'Isi-sync ang mga ulat…', 'Sync': 'I-sync', ' waiting report': ' ulat na naghihintay', ' waiting reports': ' ulat na naghihintay',
  'View and edit your account information': 'Tingnan at baguhin ang impormasyon ng account',
  'Coverage overview': 'Pangkalahatang saklaw', 'My farms': 'Aking mga sakahan', 'Farm records linked to your account.': 'Mga sakahang naka-link sa iyong account.',
  'Total monitored': 'Kabuuang sinusubaybayan', 'Crop damage severity': 'Antas ng pinsala sa pananim', 'Farmer estimate': 'Tantiya ng magsasaka',
  'Mild': 'Banayad', 'Moderate': 'Katamtaman', 'Severe': 'Malubha', 'Highly severe': 'Napakalubha', 'Not assessed': 'Hindi pa nasusuri',
  '1–20% damage': '1–20% na pinsala', '21–50% damage': '21–50% na pinsala', '51–70% damage': '51–70% na pinsala', '71–100% damage': '71–100% na pinsala',
  'Severity reflects your observation. SRA review is recorded separately.': 'Batay sa iyong obserbasyon ang antas ng pinsala. Hiwalay na itinatala ang pagsusuri ng SRA.',
  'My latest report': 'Pinakabago kong ulat', 'See all': 'Tingnan lahat', 'No reports yet': 'Wala pang ulat',
  'When you submit a field observation, it will appear here.': 'Lalabas dito ang iyong obserbasyon kapag nagsumite ka ng ulat.',
  'Export summary': 'I-export ang buod', 'Add field report': 'Magdagdag ng ulat sa bukid', 'View map': 'Tingnan ang mapa', 'View reports': 'Tingnan ang mga ulat',
  'A farmer report is an observation for SRA review. It is not a confirmed RSSI finding.': 'Obserbasyon ang ulat ng magsasaka na susuriin ng SRA. Hindi ito kumpirmadong resulta ng RSSI.',
  'YOUR PROPERTY RECORDS': 'MGA TALA NG IYONG SAKAHAN', 'Manage the farm locations linked to your account.': 'Pamahalaan ang mga sakahang naka-link sa iyong account.',
  'Add a farm': 'Magdagdag ng sakahan', 'Your farms': 'Iyong mga sakahan',
  'Add a farm you own or manage. Exact coordinates are not required.': 'Magdagdag ng sakahang pag-aari o pinamamahalaan mo. Hindi kailangan ang eksaktong koordinado.',
  'Only farms in your account are shown here.': 'Mga sakahang nasa account mo lamang ang makikita rito.',
  'Farm name': 'Pangalan ng sakahan', 'Your farm name': 'Pangalan ng iyong sakahan', 'Province': 'Probinsya',
  'Oriental': 'Silangan', 'Occidental': 'Kanluran', 'Municipality / city': 'Munisipalidad / lungsod',
  'Barangay (optional)': 'Barangay (opsyonal)', 'Barangay': 'Barangay', 'Complete farm address': 'Kumpletong address ng sakahan', 'Farm area (hectares) *': 'Lawak ng sakahan (ektarya) *',
  'Required to size your farm circle on the map.': 'Kailangan ito para maitakda ang laki ng bilog ng sakahan sa mapa.',
  'Save an exact GPS pin for my farm (optional)': 'I-save ang eksaktong GPS pin ng sakahan (opsyonal)',
  'Your exact pin is visible only to you and authorized SRA staff.': 'Ikaw at ang awtorisadong kawani ng SRA lamang ang makakakita ng eksaktong pin.',
  'Getting location…': 'Kinukuha ang lokasyon…', 'GPS pin saved for this farm': 'Na-save ang GPS pin ng sakahan',
  'Use current location': 'Gamitin ang kasalukuyang lokasyon', 'Adding a farm needs a connection. You can still save reports about farms already on your account.': 'Kailangan ng koneksyon para magdagdag ng sakahan. Maaari ka pa ring magsumite ng ulat tungkol sa mga sakahang nasa account mo na.',
  'Cancel': 'Kanselahin', 'Save farm': 'I-save ang sakahan', 'No farms added yet': 'Wala pang naidaragdag na sakahan',
  'Add your farm to start reporting field observations.': 'Idagdag ang iyong sakahan para makapagsumite ng obserbasyon sa bukid.',
  '＋  Add a farm': '＋ Magdagdag ng sakahan', 'Location privacy': 'Pagkapribado ng lokasyon',
  'Farm addresses are visible to you and authorized SRA staff. Your exact GPS pin is optional and is only stored when you give consent.': 'Ikaw at ang awtorisadong kawani ng SRA lamang ang makakakita sa mga address ng sakahan. Opsyonal ang eksaktong GPS pin at ise-save lamang ito kapag pumayag ka.',
  'NEGROS ORIENTAL & OCCIDENTAL': 'NEGROS ORIENTAL AT OCCIDENTAL',
  'Farm circle size follows the recorded hectares. Circle color follows your latest farmer-submitted report severity.': 'Batay sa naitalang ektarya ang laki ng bilog. Batay sa pinakabagong antas ng pinsalang iniulat mo ang kulay nito.',
  'Search city, farm, or report…': 'Maghanap ng lungsod, sakahan, o ulat…', 'Search map coverage': 'Maghanap sa mapa',
  'All provinces': 'Lahat ng probinsya', 'Both provinces': 'Magkabilang probinsya', 'All severity': 'Lahat ng antas',
  'Map needs internet': 'Kailangan ng internet para sa mapa', 'Your saved farms remain available below. Map tiles load only while connected.': 'Makikita pa rin sa ibaba ang mga naka-save mong sakahan. Naglo-load lamang ang mapa kapag may koneksyon.',
  'Farm area and report severity': 'Lawak ng sakahan at antas ng pinsala',
  'Circles approximate recorded farm area. Colors follow the farmer’s latest damage estimate, not an SRA diagnosis.': 'Tinatayang lawak ng sakahan ang ipinapakita ng mga bilog. Batay sa pinakabagong tantiya ng pinsala ang mga kulay, hindi sa diagnosis ng SRA.',
  'Gray · no report / not assessed': 'Abo · walang ulat / hindi pa nasusuri', 'Blue · Mild · 1–20%': 'Asul · Banayad · 1–20%',
  'Yellow · Moderate · 21–50%': 'Dilaw · Katamtaman · 21–50%', 'Orange · Severe · 51–70%': 'Kahel · Malubha · 51–70%',
  'Red · Highly severe · 71–100%': 'Pula · Napakalubha · 71–100%', 'No farm records': 'Walang tala ng sakahan',
  'Add a farm to see it in your account.': 'Magdagdag ng sakahan para makita ito sa account mo.',
  'No farms match your search': 'Walang sakahang tumutugma sa paghahanap', 'Try a different farm name, province, or municipality.': 'Subukan ang ibang pangalan ng sakahan, probinsya, o munisipalidad.',
  'Counts show only records linked to your account.': 'Mga tala lamang na naka-link sa account mo ang binibilang.',
  'No report areas yet': 'Wala pang lugar na may ulat', 'Municipalities from your submitted reports will appear here.': 'Lalabas dito ang mga munisipalidad mula sa mga isinumite mong ulat.',
  'Selected report': 'Napiling ulat', 'No reports match these filters': 'Walang ulat na tumutugma sa mga filter',
  'Change the province or severity filter to see more of your records.': 'Baguhin ang filter ng probinsya o antas ng pinsala para makakita ng iba pang tala.',
  'Open report details': 'Buksan ang detalye ng ulat',
  'SUBMIT A SUGARCANE RSSI OBSERVATION': 'MAGSUMITE NG OBSERBASYON SA TUBO AT RSSI',
  'Record what you observed. Your report stays an observation until reviewed by SRA.': 'Itala ang iyong naobserbahan. Mananatiling obserbasyon ang ulat hanggang masuri ng SRA.',
  'Add your farm first': 'Idagdag muna ang iyong sakahan', 'A report must be linked to a farm in your account.': 'Dapat naka-link sa sakahan ng account mo ang ulat.',
  'Go to My farms': 'Pumunta sa Aking mga sakahan', 'Farm and location': 'Sakahan at lokasyon',
  'Reports are saved to your account and kept private for SRA review.': 'Sine-save sa account mo ang mga ulat at pribado ang mga ito para sa pagsusuri ng SRA.',
  'Farm / plot location *': 'Lokasyon ng sakahan / lote *', 'Farm address': 'Address ng sakahan', 'Use default farm location': 'Gamitin ang default na lokasyon ng sakahan',
  'Uses the address saved with this farm. You can enter a field or block below.': 'Gagamitin ang address na naka-save sa sakahang ito. Maaari kang maglagay ng pangalan ng bukid o bloke sa ibaba.',
  'Field / block / landmark': 'Bukid / bloke / palatandaan', 'Field section or nearby landmark': 'Bahagi ng bukid o kalapit na palatandaan',
  'Observed severity': 'Antas ng pinsalang naobserbahan', ' · Subject to SRA review': ' · Susuriin ng SRA',
  'Description *': 'Paglalarawan *', 'Describe symptoms, affected area, or plant growth stage…': 'Ilarawan ang sintomas, lawak ng pinsala, o yugto ng paglaki ng halaman…',
  'Damage details *': 'Detalye ng pinsala *', 'What damage did you notice?': 'Anong pinsala ang napansin mo?',
  'Observed date (YYYY-MM-DD) *': 'Petsa ng obserbasyon (YYYY-MM-DD) *', 'Estimated affected area (ha)': 'Tinatayang lawak na apektado (ha)',
  'Photo evidence': 'Mga litrato bilang ebidensya', 'Photos are optional and are uploaded privately with your report.': 'Opsyonal ang mga litrato at pribadong ia-upload kasama ng ulat mo.',
  'Take photo': 'Kumuha ng litrato', 'Choose photos': 'Pumili ng mga litrato',
  'Add up to five photos of the affected stalks, leaves, or field area.': 'Maaaring magdagdag ng hanggang limang litrato ng apektadong tubo, dahon, o bahagi ng bukid.',
  'Consent & sharing': 'Pahintulot at pagbabahagi', 'I give SRA permission to review these observations and photos. *': 'Pinahihintulutan ko ang SRA na suriin ang mga obserbasyon at litratong ito. *',
  'Required to send a report. You can submit while offline; it will wait securely on this device.': 'Kailangan ito para makapagsumite ng ulat. Maaari kang magsumite offline; ligtas itong maghihintay sa device na ito.',
  'Share an anonymized observation with the farmer community': 'Ibahagi sa komunidad ng magsasaka ang obserbasyong walang pagkakakilanlan',
  'Optional. Your name, farm name, barangay, exact location and photos are never shared.': 'Opsyonal. Hindi ibabahagi ang pangalan mo, sakahan, barangay, eksaktong lokasyon, o mga litrato.',
  'Save & submit report': 'I-save at isumite ang ulat', 'Saving report…': 'Sine-save ang ulat…',
  'If offline, your report appears in My reports as waiting to sync.': 'Kapag offline, makikita ang ulat sa Mga ulat ko habang naghihintay na mai-sync.',
  'REPORT DETAILS': 'DETALYE NG ULAT', 'REPORT HISTORY': 'KASAYSAYAN NG MGA ULAT', 'Back to reports': 'Bumalik sa mga ulat',
  'SRA status': 'Katayuan ng SRA', 'Observed': 'Naobserbahan', 'Submitted': 'Isinumite', 'Farmer severity': 'Antas ng pinsala ayon sa magsasaka',
  'Farmer-estimated crop damage; SRA verification is recorded separately.': 'Tantiya ng magsasaka ang pinsala sa pananim; hiwalay na itinatala ang beripikasyon ng SRA.',
  'SRA severity': 'Antas ng pinsalang tinaya ng SRA', 'Affected area': 'Lawak na apektado', 'Observation': 'Obserbasyon',
  'Damage description': 'Paglalarawan ng pinsala', 'Attached photos': 'Mga kalakip na litrato',
  'A farmer report is an observation for SRA review. The farmer\'s estimate is not an SRA diagnosis.': 'Obserbasyon ang ulat ng magsasaka na susuriin ng SRA. Hindi ito diagnosis ng SRA.',
  'Filter your observations, view their review status, or export a CSV summary.': 'I-filter ang mga obserbasyon, tingnan ang katayuan ng pagsusuri, o i-export ang buod na CSV.',
  'Refresh': 'I-refresh', 'All': 'Lahat', 'Pending': 'Nakabinbin', 'Reviewed': 'Nasuri', 'Active filters': 'Mga aktibong filter',
  'All statuses': 'Lahat ng katayuan', 'Reports awaiting SRA review.': 'Mga ulat na naghihintay ng pagsusuri ng SRA.',
  'Reports with a recorded SRA review.': 'Mga ulat na may naitalang pagsusuri ng SRA.', 'Reports you marked severe or highly severe.': 'Mga ulat na minarkahan mong malubha o napakalubha.',
  'All reports from your account.': 'Lahat ng ulat mula sa account mo.', 'Change filters': 'Baguhin ang mga filter', 'Export CSV': 'I-export ang CSV',
  'Search reports, farms, or municipalities': 'Maghanap ng ulat, sakahan, o munisipalidad', 'Search reports': 'Maghanap ng mga ulat',
  'Waiting to sync': 'Naghihintay na mai-sync', 'Reports are stored on this device and send automatically when the server is reachable.': 'Naka-save sa device na ito ang mga ulat at awtomatikong ipapadala kapag maabot ang server.',
  'Syncing…': 'Isi-sync…', 'Try sync now': 'Subukang i-sync ngayon', 'Submitted reports': 'Mga isinumiteng ulat',
  'Showing your last saved records. New report updates load when you reconnect.': 'Ipinapakita ang huling naka-save na mga tala. Maglo-load ang mga bagong update kapag nakakonekta ka na.',
  'No submitted reports': 'Walang naisumiteng ulat', 'Reports you submit will appear here after they sync.': 'Lalabas dito ang mga isinumite mong ulat pagkatapos ma-sync.',
  'Change the status filter or search for another report.': 'Baguhin ang filter ng katayuan o maghanap ng ibang ulat.',
  'Report status and severity are separate. A farmer’s estimate is not an SRA diagnosis.': 'Magkaiba ang katayuan ng ulat at antas ng pinsala. Hindi diagnosis ng SRA ang tantiya ng magsasaka.',
  'SRA FARMER NETWORK': 'NETWORK NG MGA MAGSASAKA NG SRA', 'Field updates': 'Mga update sa bukid',
  'Community observations are shared only with the farmer’s consent and exclude personal details.': 'Ibinabahagi lamang ang obserbasyon sa komunidad kapag pumayag ang magsasaka, at walang personal na detalye.',
  'My reports': 'Mga ulat ko', 'Shared observations': 'Mga ibinahaging obserbasyon', 'Reload': 'I-load muli',
  'Only posts that farmers chose to share appear here. Identity and exact farm details are removed.': 'Mga post lamang na piniling ibahagi ng mga magsasaka ang makikita rito. Inalis ang pagkakakilanlan at eksaktong detalye ng sakahan.',
  'No shared updates yet': 'Wala pang ibinahaging update', 'When a farmer opts in to share an observation, it will appear here.': 'Lalabas dito ang obserbasyon kapag pinili ng magsasaka na ibahagi ito.',
  'A community response is not a pest confirmation. Only authorized SRA staff can verify a report.': 'Hindi kumpirmasyon ng peste ang tugon ng komunidad. Awtorisadong kawani lamang ng SRA ang maaaring magberipika ng ulat.',
  'ACCOUNT & PRIVACY': 'ACCOUNT AT PAGKAPRIBADO', 'Update your account information and default farm details.': 'I-update ang impormasyon ng account at mga detalye ng default na sakahan.',
  'Personal information': 'Personal na impormasyon', 'Full name': 'Buong pangalan', 'Your name': 'Pangalan mo', 'Email address': 'Email address',
  'Email changes are managed by your SRA administrator.': 'Ang administrator ng SRA ang namamahala sa pagbabago ng email.',
  'Saving…': 'Sine-save…', 'Save changes': 'I-save ang mga pagbabago', 'Edit profile': 'I-edit ang profile',
  'Farmer reference': 'Reference ng magsasaka', 'Account status': 'Katayuan ng account',
  'Default farm / report address': 'Default na address ng sakahan / ulat', 'Edit farms': 'I-edit ang mga sakahan', 'Farm / plot': 'Sakahan / lote',
  'Not provided': 'Hindi ibinigay',
  'This farm is selected for your next field report. You can choose another farm before submitting.': 'Napili ang sakahang ito para sa susunod mong ulat. Maaari kang pumili ng ibang sakahan bago magsumite.',
  'No default farm yet': 'Wala pang default na sakahan', 'Add a farm so it can be used as the default address for new reports.': 'Magdagdag ng sakahan para magamit itong default na address sa mga bagong ulat.',
  'Choose default farm': 'Piliin ang default na sakahan', 'Data stored for offline use': 'Datos na naka-save para magamit offline',
  'Your account session, saved farm details, last report list and unsent reports are stored in your device’s protected credential store. Unsent items sync when RSSI is reachable.': 'Ligtas na naka-save sa device ang session ng account, mga detalye ng sakahan, huling listahan ng ulat, at mga hindi pa naipapadalang ulat. Isi-sync ang mga ito kapag maabot ang RSSI.',
  'Community updates are not cached and cannot be opened offline.': 'Hindi naka-cache ang mga update ng komunidad at hindi ito mabubuksan offline.',
  'My account': 'Aking account', 'Sign out': 'Mag-sign out',
  'HELP CENTER': 'SENTRO NG TULONG', 'Quick help for common RSSI farmer app tasks.': 'Mabilis na tulong para sa karaniwang gawain sa RSSI app ng magsasaka.',
  'Can\'t sign in?': 'Hindi makapag-sign in?',
  'Check the email and password you registered with, confirm your device is online, and try again. Contact your SRA administrator if you still cannot sign in.': 'Tiyaking tama ang email at password na ginamit mo, at nakakonekta sa internet ang device bago sumubok muli. Kung hindi pa rin makapag-sign in, makipag-ugnayan sa administrator ng SRA.',
  'Server unavailable or offline?': 'Hindi available o offline ang server?',
  'Saved farms and reports remain on this device. Reports waiting to sync are submitted automatically after the server is reachable; you can also retry from My reports.': 'Mananatili sa device na ito ang mga naka-save na sakahan at ulat. Awtomatikong ipapadala ang mga ulat kapag maabot na ang server; maaari mo ring subukang muli mula sa Mga ulat ko.',
  'Location and privacy': 'Lokasyon at pagkapribado',
  'A precise farm pin is optional and saved only after you grant location permission. Community posts are shared only when you opt in, and never include your name, farm name, exact location, or photos.': 'Opsyonal ang eksaktong pin ng sakahan at ise-save lamang kapag pumayag ka. Ibinabahagi lamang ang post sa komunidad kapag pinili mo ito; hindi kasama ang pangalan mo, sakahan, eksaktong lokasyon, o mga litrato.',
  'Need help from SRA?': 'Kailangan ng tulong mula sa SRA?',
  'Contact your SRA administrator through your organization\'s established support channel and include your farmer reference: ': 'Makipag-ugnayan sa administrator ng SRA sa opisyal na support channel ng inyong organisasyon at ibigay ang reference mo bilang magsasaka: ',
  'Community confirmations reflect farmer agreement. Only authorized SRA staff can verify an observation.': 'Ipinapakita ng kumpirmasyon ng komunidad ang pagsang-ayon ng mga magsasaka. Awtorisadong kawani lamang ng SRA ang maaaring magberipika ng obserbasyon.',
  'Language': 'Wika', 'App language': 'Wika ng app', 'Choose the language used in the app.': 'Piliin ang wikang gagamitin sa app.',
  'App settings': 'Mga setting ng app',
  'Appearance': 'Hitsura', 'Choose system, light, or dark appearance.': 'Pumili ng system, maliwanag, o madilim na hitsura.',
  'System': 'Ayon sa system', 'Light': 'Maliwanag', 'Dark': 'Madilim',
  'English': 'English', 'Tagalog': 'Tagalog', 'Select language': 'Pumili ng wika',
  'Sign in to view your farms and report sugarcane observations.': 'Mag-sign in para makita ang iyong mga sakahan at makapagsumite ng obserbasyon sa tubo.',
  'Use the official RSSI server account provided by your team.': 'Gamitin ang opisyal na RSSI account na ibinigay ng inyong team.',
  'Sign in': 'Mag-sign in', 'Register': 'Magparehistro', 'New to RSSI? Register your farm': 'Bago sa RSSI? Irehistro ang iyong sakahan',
  'Already registered? Sign in': 'Nakarehistro na? Mag-sign in', 'Password': 'Password', 'Create a password': 'Gumawa ng password',
  'Password (10 characters minimum)': 'Password (hindi bababa sa 10 character)', 'Create Farmer Account': 'Gumawa ng farmer account',
  'Farmer name *': 'Pangalan ng magsasaka *', 'Enter your full name': 'Ilagay ang buong pangalan mo',
  'Farm name or landmark': 'Pangalan ng sakahan o palatandaan', 'Select your municipality or city': 'Piliin ang munisipalidad o lungsod mo',
  'House / lot, sitio or purok, barangay, municipality, province': 'Bahay / lote, sitio o purok, barangay, munisipalidad, probinsya',
  'Get GPS location': 'Kunin ang lokasyon sa GPS', 'Location pin confirmed': 'Nakumpirma ang pin ng lokasyon',
  'Save a pin only if you want authorized SRA staff to see your farm’s precise location.': 'I-save lamang ang pin kung gusto mong makita ng awtorisadong kawani ng SRA ang eksaktong lokasyon ng sakahan.',
  'I agree to share my farm reports with SRA for review.': 'Sumasang-ayon akong ibahagi sa SRA ang mga ulat ko sa sakahan para masuri.',
  'Your precise property location stays private to authorized staff.': 'Pribado sa awtorisadong kawani ang eksaktong lokasyon ng iyong ari-arian.',
  'Enter your email and password to continue.': 'Ilagay ang email at password mo para magpatuloy.',
  'Choose to share your precise farm pin before using GPS.': 'Pumayag munang ibahagi ang eksaktong pin ng sakahan bago gamitin ang GPS.',
  'Could not read the farm location.': 'Hindi makuha ang lokasyon ng sakahan.', 'Could not read location.': 'Hindi makuha ang lokasyon.',
  'Could not save that photo safely on this device. Try another image.': 'Hindi ligtas na ma-save ang litratong iyon sa device. Sumubok ng ibang larawan.',
  'Could not save the farm.': 'Hindi ma-save ang sakahan.', 'Could not save this report on your device.': 'Hindi ma-save ang ulat sa device mo.',
  'Could not update your profile.': 'Hindi ma-update ang profile mo.', 'Could not send your community response.': 'Hindi naipadala ang tugon mo sa komunidad.',
  'Could not export reports.': 'Hindi ma-export ang mga ulat.', 'There are no submitted reports to export yet.': 'Wala pang naisumiteng ulat na mae-export.',
  'Enter a farm name, municipality and farm area greater than zero.': 'Maglagay ng pangalan ng sakahan, munisipalidad, at lawak na higit sa zero.',
  'Add a farm before submitting an observation.': 'Magdagdag muna ng sakahan bago magsumite ng obserbasyon.',
  'Describe what you observed and the damage.': 'Ilarawan ang iyong naobserbahan at ang pinsala.',
  'Enter the observed date in YYYY-MM-DD format.': 'Ilagay ang petsa ng obserbasyon sa format na YYYY-MM-DD.',
  'Consent is required before you send this report to SRA.': 'Kailangan ang pahintulot bago ipadala ang ulat na ito sa SRA.',
  'Your profile was updated.': 'Na-update ang profile mo.', 'Enter your name before saving.': 'Ilagay ang pangalan mo bago i-save.',
  'Sign in again before editing your profile.': 'Mag-sign in muli bago i-edit ang profile mo.',
  'Your saved reports have synced with RSSI.': 'Na-sync na sa RSSI ang mga naka-save mong ulat.',
  'Saved on this device. RSSI will submit it automatically when the server is reachable.': 'Na-save sa device na ito. Awtomatikong ipapadala ito sa RSSI kapag maabot na ang server.',
  'Your session has expired. Sign in again to sync reports.': 'Nag-expire na ang session mo. Mag-sign in muli para i-sync ang mga ulat.',
  'Community updates could not reach the RSSI server.': 'Hindi makakonekta sa RSSI server para kunin ang mga update ng komunidad.',
  'For verification': 'Naghihintay ng beripikasyon', 'Confirmed': 'Kumpirmado', 'No detection': 'Walang natukoy',
  'Active': 'Aktibo', 'Inactive': 'Hindi aktibo',
  'Size not set': 'Hindi itinakda ang sukat', 'Pin saved': 'Na-save ang pin', 'Area only': 'Lawak lamang',
  'A community response is not a pest confirmation.': 'Hindi kumpirmasyon ng peste ang tugon ng komunidad.',
  'Agreement is not an official verification.': 'Hindi opisyal na beripikasyon ang pagsang-ayon.',
  'I observed something similar': 'May kahalintulad akong naobserbahan', 'You agreed with this observation': 'Sumang-ayon ka sa obserbasyong ito',
  'Map data © OpenStreetMap contributors': 'Datos ng mapa © mga kontribyutor ng OpenStreetMap',
  'Your farm location': 'Lokasyon ng iyong sakahan', 'Farm area: not recorded': 'Lawak ng sakahan: hindi naitala',
  'No farmer report submitted': 'Wala pang isinumiteng ulat ng magsasaka', 'Latest farmer-reported severity: ': 'Pinakabagong antas ng pinsalang iniulat ng magsasaka: ',
  ' damage': ' na pinsala', 'crop damage': 'pinsala sa pananim', 'Loading map…': 'Nilo-load ang mapa…',
  'Farm area (ha)': 'Lawak ng sakahan (ha)', 'Farm area: ': 'Lawak ng sakahan: ', ' ha': ' ha',
  'Support': 'Suporta', 'Map data': 'Datos ng mapa', 'Privacy': 'Pagkapribado',
  'FARMER ACCOUNT': 'ACCOUNT NG MAGSASAKA', 'Pinned location': 'Naka-pin na lokasyon',
  'Choose your farm location on the map. Tap to place or move the pin. Map tiles need internet.': 'Piliin ang lokasyon ng sakahan sa mapa. I-tap para maglagay o maglipat ng pin. Kailangan ng internet para sa mapa.','Farm pin selected': 'Napili ang pin ng sakahan',
  'Required to size your farm circle on the map. An exact GPS pin is optional and needs your consent.': 'Kailangan ito para maitakda ang laki ng bilog ng sakahan sa mapa. Opsyonal ang eksaktong GPS pin at kailangan ang pahintulot mo.',
  'Only you and authorized SRA staff can view it. The pin is not shared with community posts.': 'Ikaw at awtorisadong kawani lamang ng SRA ang makakakita nito. Hindi ibinabahagi ang pin sa mga post ng komunidad.',
  'Your password': 'Password mo',
  'Updates need internet': 'Kailangan ng internet para sa mga update',
  'Community posts and confirmations are online-only. Your own farms and saved reports still work offline.': 'Online lamang ang mga post at kumpirmasyon ng komunidad. Magagamit pa rin offline ang sarili mong mga sakahan at naka-save na ulat.',
  'Waiting for server connection': 'Naghihintay ng koneksyon sa server',
};

function translate(value: string, language: Language): string {
  if (language === 'en') return value;
  const welcome = value.match(/^Welcome back, (.+)\. Track your farms and field observations\.$/);
  if (welcome) return `Maligayang pagbabalik, ${welcome[1]}. Subaybayan ang iyong mga sakahan at obserbasyon sa bukid.`;
  const trimmed = value.trim();
  const syncNotice = trimmed.match(/^(\d+) reports? waiting to sync\. RSSI will retry automatically\.$/);
  if (syncNotice) return `${syncNotice[1]} ulat ang naghihintay na mai-sync. Awtomatikong susubukan muli ng RSSI.`;
  const syncAction = trimmed.match(/^Sync (\d+) waiting reports?$/);
  if (syncAction) return `I-sync ang ${syncAction[1]} ulat na naghihintay`;
  const photoUpload = trimmed.match(/^Waiting to upload (\d+) photos?$/);
  if (photoUpload) return `${photoUpload[1]} litrato ang naghihintay i-upload`;
  const translated = tagalog[trimmed];
  if (translated !== undefined) return value.replace(trimmed, translated);
  const countMatch = trimmed.match(/^(\d+) (provinces|farms|reports|waiting report|waiting reports)$/);
  if (countMatch) {
    const count = countMatch[1];
    const unit: Record<string, string> = {provinces: 'lalawigan', farms: 'sakahan', reports: 'ulat', 'waiting report': 'ulat na naghihintay', 'waiting reports': 'ulat na naghihintay'};
    return value.replace(trimmed, `${count} ${unit[countMatch[2]]}`);
  }
  return value;
}

const LanguageContext = createContext<LanguageContextValue>({
  language: 'en',
  setLanguage: async () => undefined,
  t: value => value,
});

export function LanguageProvider({children}: {children: React.ReactNode}) {
  const [language, setLanguageState] = useState<Language>('en');

  useEffect(() => {
    let mounted = true;
    void AsyncStorage.getItem(languageStorageKey).then(value => {
      if (mounted && (value === 'en' || value === 'tl')) setLanguageState(value);
    }).catch(() => undefined);
    return () => { mounted = false; };
  }, []);

  const setLanguage = useCallback(async (value: Language) => {
    setLanguageState(value);
    await AsyncStorage.setItem(languageStorageKey, value);
  }, []);
  const t = useCallback<Translator>(value => translate(value, language), [language]);
  const contextValue = useMemo(() => ({language, setLanguage, t}), [language, setLanguage, t]);

  return <LanguageContext.Provider value={contextValue}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  return useContext(LanguageContext);
}

export function LocalizedText({children, ...props}: TextProps) {
  const {t} = useLanguage();
  const translatedChildren = React.Children.map(children, child => typeof child === 'string' ? t(child) : child);
  return <NativeText {...props}>{translatedChildren}</NativeText>;
}
