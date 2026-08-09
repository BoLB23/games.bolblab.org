#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'assets', 'flappymike');
const write = (path, body) => {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, body.trimStart());
};

const texture = `
  <filter id="paper" x="-10%" y="-10%" width="120%" height="120%">
    <feTurbulence baseFrequency=".7" numOctaves="2" seed="7" type="fractalNoise" result="n"/>
    <feColorMatrix in="n" values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 .045 0"/>
    <feBlend in="SourceGraphic" mode="multiply"/>
  </filter>`;
const svg = (w, h, body, opts = {}) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>${texture}${opts.defs ?? ''}</defs>
  <g filter="url(#paper)">${body}</g>
</svg>`;

const clouds = `<g fill="#fff7df" opacity=".78">
  <path d="M70 120c18-31 59-28 72 2 31-12 62 7 61 38H35c-2-24 14-39 35-40Z"/>
  <path d="M610 74c15-25 49-24 61 1 26-9 52 8 51 33H581c0-19 12-31 29-34Z"/>
  <path d="M900 185c15-22 43-20 53 2 18-7 37 4 39 22h-118c1-13 10-22 26-24Z"/>
</g>`;
const sky = (country = false) => svg(960, 540, `
  <rect width="960" height="540" fill="${country ? '#86cce8' : '#78b8dd'}"/>
  <circle cx="790" cy="88" r="48" fill="#ffe7a0" opacity=".9"/>
  ${clouds}
  <path d="M0 430 Q240 ${country ? 405 : 430} 480 430 T960 430V540H0Z" fill="${country ? '#c9dfb3' : '#a8c4c8'}" opacity=".35"/>
`);

const farCity = svg(960, 230, `
  <path d="M0 230V135h45v-38h38v61h45v-86h54v102h42V48h45v126h40v-62h51v62h35V23h56v151h45V79h44v95h50v-48h48v48h42V58h58v116h45v-76h42v76h53v-38h38v94Z" fill="#59758a"/>
  <path d="M0 230V178h90v-35h112v35h121v-48h92v48h114v-27h135v27h108v-40h96v40h92v52Z" fill="#3e586a"/>
  <g fill="#d7b96a" opacity=".55"><path d="M238 64h7v94h-7zM414 40h8v120h-8zM681 72h7v92h-7z"/><path d="M225 64h34l-8-10h-18zM664 72h42l-10-11h-21z"/></g>
`);
const farTransition = svg(960, 230, `
  <path d="M0 230V171h105v-40h132v40h76v-64h150v64h89v-33h118v33h77v-55h132v55h81v59Z" fill="#71828a"/>
  <path d="M0 230v-33c85-44 161-20 238-7 98 17 155-30 252-12 90 17 144 3 220-15 94-23 169-3 250 21v46Z" fill="#75926f"/>
  <g stroke="#4b4a43" stroke-width="6"><path d="M170 120v91m-35-68h70M666 109v102m-37-66h74"/></g>
`);
const farCountry = svg(960, 230, `
  <path d="M0 230V145Q118 83 240 151T480 138T720 151T960 137V230Z" fill="#789d7b"/>
  <path d="M0 230V179Q120 123 240 184T480 173T720 186T960 171V230Z" fill="#557d63"/>
  <g fill="#3f6653" opacity=".8"><circle cx="112" cy="150" r="21"/><circle cx="146" cy="153" r="27"/><circle cx="561" cy="151" r="25"/><circle cx="604" cy="148" r="31"/><circle cx="870" cy="157" r="34"/></g>
`);

const cityMid = svg(960, 180, `
  <rect y="55" width="960" height="125" fill="#9b4f44"/>
  <path d="M0 55h105V31h105v24h120V18h112v37h98V36h128v19h97V25h113v30h82v125H0Z" fill="#a95a4b" stroke="#573c39" stroke-width="6"/>
  <g fill="#f0c778" stroke="#573c39" stroke-width="4">${Array.from({length:12},(_,i)=>`<rect x="${24+i*80}" y="${76+(i%2)*10}" width="28" height="44" rx="3"/>`).join('')}</g>
  <g stroke="#75433c" stroke-width="3" opacity=".55">${Array.from({length:8},(_,i)=>`<path d="M0 ${72+i*15}h960"/>`).join('')}</g>
  <g fill="#526870"><rect x="145" y="3" width="44" height="25" rx="3"/><rect x="601" y="11" width="52" height="25" rx="3"/></g>
`);
const transitionMid = svg(960, 180, `
  <path d="M0 180V91h180V58h176v122h88V103h188V72h184v108h124Z" fill="#8b7765" stroke="#554d47" stroke-width="6"/>
  <g fill="#d9c79c"><rect x="35" y="112" width="68" height="36"/><rect x="227" y="94" width="82" height="42"/><rect x="493" y="121" width="74" height="32"/><rect x="682" y="102" width="96" height="43"/></g>
  <g fill="#55734f"><circle cx="396" cy="130" r="44"/><circle cx="849" cy="126" r="54"/><circle cx="912" cy="137" r="37"/></g>
`);
const countryMid = svg(960, 180, `
  <path d="M0 180V101Q130 71 260 108T520 97T780 112T960 91V180Z" fill="#79a759"/>
  <path d="M0 180v-35q122-42 245 0t245 0t245 0t225 0v35Z" fill="#5f9149"/>
  <g stroke="#416d3f" stroke-width="3" opacity=".55">${Array.from({length:14},(_,i)=>`<path d="M${i*78-40} 180l85-73"/>`).join('')}</g>
  <g transform="translate(96 73)"><path d="M0 35 52 0l55 35v70H0Z" fill="#a54036" stroke="#5a3832" stroke-width="5"/><path d="M42 105V56h28v49" fill="#f4d6a2"/><rect x="122" y="26" width="29" height="79" rx="12" fill="#c6c3b1" stroke="#5c6765" stroke-width="5"/></g>
  <g transform="translate(626 101)" fill="#f3eee0" stroke="#313b3b" stroke-width="4"><ellipse cx="27" cy="30" rx="26" ry="16"/><circle cx="55" cy="25" r="11"/><path d="M13 43v22m24-22v22"/></g>
`);

const cityNear = svg(960, 145, `
  <path d="M0 145V89h92V51h84v94h116V72h98v73h132V43h104v102h119V81h99v64h116Z" fill="#40545b"/>
  <g stroke="#27373c" stroke-width="7"><path d="M56 24v121m-35-83h74M432 13v132m-38-87h77M818 29v116m-32-74h65"/></g>
  <g fill="#9cafaa" stroke="#27373c" stroke-width="4"><rect x="215" y="83" width="55" height="35" rx="4"/><rect x="646" y="73" width="67" height="43" rx="4"/></g>
`);
const transitionNear = svg(960, 145, `
  <rect y="119" width="960" height="26" fill="#65795a"/>
  <g stroke="#4d4c42" stroke-width="6"><path d="M93 21v116m-39-73h80M569 13v124m-40-78h82"/></g>
  <g fill="#4e754c"><circle cx="258" cy="89" r="47"/><circle cx="337" cy="81" r="58"/><circle cx="748" cy="85" r="53"/><circle cx="846" cy="94" r="44"/></g>
  <path d="M0 126h960" stroke="#d6d0af" stroke-width="7" stroke-dasharray="60 24"/>
`);
const countryNear = svg(960, 145, `
  <rect y="113" width="960" height="32" fill="#40723d"/>
  <g stroke="#7a5b38" stroke-width="8"><path d="M0 87h960M0 120h960"/>${Array.from({length:9},(_,i)=>`<path d="M${i*120+30} 65v80"/>`).join('')}</g>
  <g fill="#668f45">${Array.from({length:20},(_,i)=>`<path d="M${i*50-10} 116q15-60 29 0q13-50 26 0Z"/>`).join('')}</g>
`);

const ground = (base, accent, urban = false) => svg(960, 70, `
  <rect width="960" height="70" fill="${base}"/>
  <path d="M0 12h960" stroke="${accent}" stroke-width="6"/>
  ${urban ? '<path d="M0 45h960" stroke="#8d9892" stroke-width="5" stroke-dasharray="42 18"/>' : Array.from({length:24},(_,i)=>`<path d="M${i*42} 70q12-34 24 0" stroke="${accent}" stroke-width="4" fill="none"/>`).join('')}
`);

write('backgrounds/city/city_sky.svg', sky(false));
write('backgrounds/country/country_sky.svg', sky(true));
write('backgrounds/city/city_far_skyline.svg', farCity);
write('backgrounds/transition/transition_low_buildings.svg', farTransition);
write('backgrounds/country/country_far_hills.svg', farCountry);
write('backgrounds/city/city_mid_rowhomes.svg', cityMid);
write('backgrounds/transition/transition_open_land.svg', transitionMid);
write('backgrounds/country/country_fields.svg', countryMid);
write('backgrounds/city/city_near_rooftops.svg', cityNear);
write('backgrounds/transition/transition_tree_line.svg', transitionNear);
write('backgrounds/country/country_near_fence.svg', countryNear);
write('backgrounds/city/city_ground.svg', ground('#465155', '#747f79', true));
write('backgrounds/transition/transition_ground.svg', ground('#607052', '#9aa06c'));
write('backgrounds/country/country_ground.svg', ground('#47763e', '#9ab35e'));

const obstacleSvg = (base, accent, pattern, cap = accent) => svg(128, 512, `
  <rect x="5" y="0" width="118" height="512" rx="10" fill="${base}" stroke="#342f2d" stroke-width="8"/>
  ${pattern}
  <path d="M3 467h122v45H3Z" fill="${cap}" stroke="#342f2d" stroke-width="8"/>
  <path d="M14 477h100" stroke="#fff4cf" stroke-width="5" opacity=".45"/>
`);
const bricks = `<g stroke="#633a35" stroke-width="3" opacity=".72">${Array.from({length:11},(_,i)=>`<path d="M8 ${i*43+24}h112M${i%2?38:67} ${i*43+4}v40"/>`).join('')}</g><g fill="#e9c474" stroke="#463937" stroke-width="4">${[58,164,270,376].map(y=>`<rect x="37" y="${y}" width="54" height="55" rx="4"/>`).join('')}</g>`;
const vents = `<g fill="#bfc9c6" stroke="#3e4a4d" stroke-width="5"><rect x="23" y="55" width="82" height="80" rx="8"/><path d="M33 73h62M33 91h62M33 109h62"/><rect x="35" y="205" width="58" height="112" rx="8"/><circle cx="64" cy="261" r="20"/><path d="M64 231v60M34 261h60"/><path d="M64 205v-46h42v-55" fill="none"/></g>`;
const utility = `<g stroke="#3e403d" stroke-width="9" fill="none"><path d="M64 12v440M12 95h104M19 95l45 54 45-54"/></g><g fill="#e2ad44" stroke="#3b342e" stroke-width="5"><circle cx="31" cy="185" r="15"/><circle cx="64" cy="185" r="15"/><circle cx="97" cy="185" r="15"/></g><path d="M26 350h76v65H26Z" fill="#db8b44" stroke="#3b342e" stroke-width="6"/>`;
const warehouse = `<path d="M16 66 64 21l48 45v372H16Z" fill="#87918f" stroke="#3c4444" stroke-width="6"/><g fill="#d8d2bb" stroke="#3c4444" stroke-width="5">${[100,190,280,370].map(y=>`<rect x="28" y="${y}" width="72" height="54"/>`).join('')}</g>`;
const treeUtility = `<path d="M64 24v420" stroke="#66513a" stroke-width="16"/><path d="M18 112h92" stroke="#4b443a" stroke-width="9"/><g fill="#57794c" stroke="#354d39" stroke-width="5"><circle cx="33" cy="223" r="35"/><circle cx="86" cy="238" r="40"/><circle cx="57" cy="292" r="44"/></g>`;
const roadside = `<path d="M64 22v431" stroke="#625440" stroke-width="15"/><rect x="15" y="83" width="98" height="104" rx="10" fill="#6f8b78" stroke="#3b463d" stroke-width="7"/><path d="M29 107h70M29 133h55" stroke="#e9e2bd" stroke-width="7"/><path d="M9 374h110" stroke="#8d744c" stroke-width="14"/>`;
const barn = `<path d="M12 126 64 53l52 73v320H12Z" fill="#a94539" stroke="#4a3430" stroke-width="7"/><path d="M28 445V244h72v201" fill="#d9c69d" stroke="#4a3430" stroke-width="7"/><path d="m31 250 66 185m0-185L31 435" stroke="#a94539" stroke-width="9"/>`;
const siloHay = `<rect x="25" y="58" width="78" height="314" rx="37" fill="#c6c9ba" stroke="#4a5551" stroke-width="7"/><path d="M25 96q39-75 78 0" fill="#9ea9a5" stroke="#4a5551" stroke-width="7"/><g fill="#d6aa4a" stroke="#74562f" stroke-width="6"><rect x="14" y="360" width="100" height="56" rx="9"/><rect x="24" y="416" width="80" height="43" rx="8"/></g>`;
const cornFence = `<g fill="#567f3e" stroke="#355331" stroke-width="4">${Array.from({length:5},(_,i)=>`<path d="M${22+i*21} 36v405m0-180q-31-38 0-62m0 91q30-37 0-64"/>`).join('')}</g><g stroke="#7a5938" stroke-width="16"><path d="M6 336h116M6 405h116"/><path d="M29 300v165M99 300v165"/></g>`;

const obstacles = [
  ['city/obstacle_city_rowhome.svg','#9d5145','#d0a05e',bricks],
  ['city/obstacle_city_rooftop.svg','#667479','#c6cfcb',vents],
  ['city/obstacle_city_utility.svg','#6d6f69','#d4a53c',utility],
  ['transition/obstacle_transition_warehouse.svg','#7d8581','#c9ba91',warehouse],
  ['transition/obstacle_transition_tree_utility.svg','#65775a','#a4a16c',treeUtility],
  ['transition/obstacle_transition_roadside.svg','#7f826e','#d2bb72',roadside],
  ['country/obstacle_country_barn.svg','#a94539','#e1c07a',barn],
  ['country/obstacle_country_silo_hay.svg','#899790','#d5ad50',siloHay],
  ['country/obstacle_country_corn_fence.svg','#5e8146','#a67b43',cornFence],
];
for (const [path, base, accent, pattern] of obstacles) write(`obstacles/${path}`, obstacleSvg(base, accent, pattern));

const transparent = (w, h, body) => svg(w, h, body);
write('decorations/country/decor_country_cow_blackwhite.svg', transparent(150, 90, `<g stroke="#303433" stroke-width="5"><ellipse cx="69" cy="48" rx="48" ry="28" fill="#f4ead5"/><circle cx="119" cy="43" r="21" fill="#f4ead5"/><path d="M36 67v20m35-13v13m25-16v16m23-25v25"/><path d="M28 34q-20-15-22 4" fill="none"/></g><g fill="#303433"><path d="M43 26q26-13 35 12q-14 21-31 10Z"/><circle cx="118" cy="42" r="5"/></g>`));
write('decorations/country/decor_country_buggy.svg', transparent(190, 105, `<g stroke="#392f27" stroke-width="6" fill="none"><circle cx="68" cy="78" r="24"/><circle cx="135" cy="78" r="24"/><path d="M26 72h131M93 69V27h50l22 42M20 69 5 45"/></g><path d="M73 31h65l19 39H66Z" fill="#493d32" stroke="#292522" stroke-width="6"/><path d="M5 45q16-19 34 0v25H12" fill="#654831" stroke="#292522" stroke-width="5"/>`));
write('decorations/city/decor_city_water_tower.svg', transparent(120, 170, `<g stroke="#35454b" stroke-width="7" fill="none"><path d="M27 164 48 66m45 98L72 66M20 132h80"/></g><path d="M22 16h76l-8 55H30Z" fill="#77898e" stroke="#35454b" stroke-width="7"/><path d="M25 16q35-23 70 0" fill="#a4b1b2" stroke="#35454b" stroke-width="7"/>`));
write('decorations/transition/landmark_highway_sign.svg', transparent(210, 145, `<g stroke="#4c514d" stroke-width="8"><path d="M50 72v73m110-73v73"/></g><rect x="12" y="8" width="186" height="76" rx="12" fill="#66816c" stroke="#39473c" stroke-width="7"/><path d="M39 34h129M39 58h93" stroke="#f1e8c4" stroke-width="8"/>`));
write('effects/fx_flap_puff.svg', transparent(48, 32, `<path d="M6 24q-7-12 8-16q8-12 18 0q15-2 12 12q-4 10-16 7q-10 9-17 0Z" fill="#fff4d6" opacity=".75"/>`));
write('effects/fx_feather_01.svg', transparent(28, 44, `<path d="M5 34Q2 7 23 3q2 23-15 35" fill="#d88931" stroke="#633e2a" stroke-width="3"/><path d="m8 38 13-30" stroke="#633e2a" stroke-width="2"/>`));
write('effects/fx_feather_02.svg', transparent(28, 44, `<path d="M4 12Q17 1 24 6q-2 25-18 33" fill="#f0ad3d" stroke="#633e2a" stroke-width="3"/><path d="M7 39 21 9" stroke="#633e2a" stroke-width="2"/>`));
write('effects/fx_impact_star.svg', transparent(64, 64, `<path d="m32 2 8 19 20-7-10 18 12 15-21-2-9 17-8-18-21 6 11-19L2 16l21 2Z" fill="#ffd451" stroke="#7d482f" stroke-width="4"/>`));
write('ui/logo_flappymike.svg', transparent(520, 160, `<path d="M30 111q18-86 62-36q37-67 68 0q36-61 67 2q36-57 72 1q35-49 70 0q38-50 78 5q28-25 45 29" fill="none" stroke="#56372c" stroke-width="38" stroke-linecap="round" stroke-linejoin="round"/><text x="260" y="116" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-size="82" font-style="italic" fill="#ffd06a" stroke="#56372c" stroke-width="5" paint-order="stroke">FlappyMike</text><g transform="translate(423 18)" fill="none" stroke="#292626" stroke-width="8"><circle cx="20" cy="20" r="16"/><circle cx="59" cy="20" r="16"/><path d="M36 20h7M4 18-9 13m84 5 13-5"/><path d="M17 45q10-15 20 0q10-15 20 0"/></g>`));

console.log(`Generated illustrated fallback art in ${root}`);
