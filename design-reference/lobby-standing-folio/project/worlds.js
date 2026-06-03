/* SideQuest world catalogue — 20 worlds across 11 genres.
   Genres ordered as the lobby presents them. Each world carries era, tone
   chips, inspirations, live-presence count, and a per-world atmospheric art
   recipe (layered CSS gradients) standing in for the runtime hero render. */

window.SQ_GENRES = [
  { slug:"low_fantasy",        label:"Low Fantasy",        dinkus:"⁂" },
  { slug:"tea_and_murder",     label:"Tea & Murder",       dinkus:"❧" },
  { slug:"elemental_harmony",  label:"Elemental Harmony",  dinkus:"❋" },
  { slug:"caverns_and_claudes",label:"Caverns & Claudes",  dinkus:"⛏" },
  { slug:"space_opera",        label:"Space Opera",        dinkus:"✦" },
  { slug:"neon_dystopia",      label:"Neon Dystopia",      dinkus:"◆" },
  { slug:"mutant_wasteland",   label:"Mutant Wasteland",   dinkus:"☢" },
  { slug:"road_warrior",       label:"Road Warrior",       dinkus:"⛟" },
  { slug:"spaghetti_western",  label:"Spaghetti Western",  dinkus:"✶" },
  { slug:"pulp_noir",          label:"Pulp Noir",          dinkus:"✦" },
  { slug:"heavy_metal",        label:"Heavy Metal",        dinkus:"⛧" },
];
window.SQ_GENRE_LABEL = Object.fromEntries(window.SQ_GENRES.map(g => [g.slug, g.label]));

const W = (o) => o;
window.SQ_WORLDS = [
  // ── Low Fantasy ──
  W({ slug:"low_fantasy/glenross", genre:"low_fantasy", world:"Glenross", initial:"G", here:2,
    era:"The Marches · a generation after the war",
    blurb:"A rain-slick country house, a sealed letter, and a body in the conservatory. The fae have not been seen in Glenross since the war — and the roads out are watched.",
    tone:[["high","mythic"],["medium","intrigue"],["low","comedy"]], dinkus:"⁂",
    inspirations:["Susanna Clarke","Earthsea","The Wee Free Men"],
    art:"radial-gradient(120% 90% at 70% 12%, #5a6b66 0%, #3c4a47 32%, transparent 60%), radial-gradient(90% 70% at 20% 100%, #2a2014 0%, transparent 55%), linear-gradient(180deg, #2e3a39 0%, #221a10 70%)" }),
  W({ slug:"low_fantasy/the_brackenmoor", genre:"low_fantasy", world:"The Brackenmoor", initial:"B", here:0,
    era:"The high moor · the turning of the year",
    blurb:"Peat smoke, standing stones, and a debt owed to something under the hill. The shepherds count their flock twice now, and still come up one short.",
    tone:[["high","folklore"],["medium","dread"],["low","mercy"]], dinkus:"⁂",
    inspirations:["The Owl Service","Hellboy: The Crooked Man","Beowulf"],
    art:"radial-gradient(110% 80% at 30% 16%, #6a6a52 0%, #3e3e2c 34%, transparent 62%), radial-gradient(90% 70% at 78% 96%, #241a10 0%, transparent 52%), linear-gradient(180deg, #3a3a2a 0%, #1f1a12 78%)" }),

  // ── Tea & Murder ──
  W({ slug:"tea_and_murder/curfew", genre:"tea_and_murder", world:"Curfew at Avely", initial:"A", here:0,
    era:"Edwardian England · c. 1908",
    blurb:"A country weekend, a guest list of suspects, and a body in the rose garden. You have a day job and a question. By Tuesday tea you'll have it sorted — or you won't.",
    tone:[["high","cosy"],["high","gossip"],["low","gore"]], dinkus:"❧",
    inspirations:["Agatha Christie","Gosford Park","Knives Out"],
    art:"radial-gradient(110% 80% at 28% 18%, #e9d8b0 0%, #c9a96e 30%, transparent 62%), radial-gradient(80% 70% at 88% 92%, #5c7a4f 0%, transparent 55%), linear-gradient(180deg, #b59b6e 0%, #6f5a3a 72%)" }),
  W({ slug:"tea_and_murder/the_lavender_line", genre:"tea_and_murder", world:"The Lavender Line", initial:"L", here:1,
    era:"A branch railway · late summer, 1911",
    blurb:"The 4:15 to Wexcombe is nine minutes late and one passenger short. The tea trolley remembers everything, and the stationmaster remembers rather less than he should.",
    tone:[["high","cosy"],["medium","puzzle"],["low","gore"]], dinkus:"❧",
    inspirations:["Murder on the Orient Express","Father Brown","The 4:50 from Paddington"],
    art:"radial-gradient(100% 80% at 70% 20%, #e6d4b4 0%, #c2a06a 32%, transparent 60%), radial-gradient(80% 70% at 16% 94%, #7c6f4a 0%, transparent 52%), linear-gradient(180deg, #bda878 0%, #65543a 74%)" }),

  // ── Elemental Harmony ──
  W({ slug:"elemental_harmony/iron_pavilion", genre:"elemental_harmony", world:"The Iron Pavilion", initial:"P", here:0,
    era:"The high shrine · the season of long mist",
    blurb:"A mountain shrine, three sworn disciples, and a master whose tea is always poured for one more guest than has arrived. The bell has not rung in nine years. Tonight it rings.",
    tone:[["high","serene"],["medium","honour"],["medium","wonder"]], dinkus:"❋",
    inspirations:["Avatar: TLA","Crouching Tiger","The Tale of Genji"],
    art:"radial-gradient(100% 80% at 30% 20%, #d6d4e6 0%, #a89ec0 32%, transparent 60%), radial-gradient(80% 70% at 84% 90%, #9e3520 0%, transparent 46%), linear-gradient(180deg, #6a6480 0%, #322a3a 76%)" }),
  W({ slug:"elemental_harmony/cinder_monastery", genre:"elemental_harmony", world:"Cinder Monastery", initial:"C", here:0,
    era:"The volcano's shoulder · the year the ash fell",
    blurb:"A forge-temple on a sleeping mountain, where the smiths pray in hammer-strokes. The mountain has begun to dream again, and the abbot will not say of what.",
    tone:[["high","fervour"],["medium","wonder"],["low","stillness"]], dinkus:"❋",
    inspirations:["Princess Mononoke","The Water Margin","Spirited Away"],
    art:"radial-gradient(90% 70% at 64% 24%, #e0a060 0%, #9e3520 34%, transparent 60%), radial-gradient(100% 80% at 24% 96%, #2a1a2e 0%, transparent 54%), linear-gradient(180deg, #5a3a44 0%, #2a1c22 78%)" }),

  // ── Caverns & Claudes ──
  W({ slug:"caverns_and_claudes/the_old_keep", genre:"caverns_and_claudes", world:"The Old Keep", initial:"K", here:4,
    era:"Somewhere below · four torches deep",
    blurb:"A dungeon, four torches, three rations, and an argument about whose fault the last one was. The map is wrong about the third door. It is always wrong about the third door.",
    tone:[["high","peril"],["high","comedy"],["medium","loot"]], dinkus:"⛏",
    inspirations:["The Gold Box games","Dungeon Meshi","The Tower of the Elephant"],
    art:"radial-gradient(70% 70% at 50% 40%, #d4a843 0%, #8a5e1e 26%, transparent 52%), radial-gradient(120% 90% at 50% 100%, #3a1c10 0%, transparent 60%), linear-gradient(180deg, #2a2318 0%, #1a1610 80%)" }),
  W({ slug:"caverns_and_claudes/the_gullet", genre:"caverns_and_claudes", world:"The Gullet", initial:"G", here:0,
    era:"The deep dark · past where the maps end",
    blurb:"A flooded chasm that swallows rivers and the occasional expedition. Something down here keeps the lanterns it takes. You can see them, far below, still lit.",
    tone:[["high","peril"],["medium","dread"],["medium","loot"]], dinkus:"⛏",
    inspirations:["Descent","Veins of the Earth","The Descent"],
    art:"radial-gradient(70% 60% at 50% 30%, #c08a2e 0%, #5a3410 28%, transparent 54%), radial-gradient(120% 100% at 50% 104%, #10222a 0%, transparent 58%), linear-gradient(180deg, #241e16 0%, #12100c 82%)" }),

  // ── Space Opera ──
  W({ slug:"space_opera/the_kestrel", genre:"space_opera", world:"The Kestrel", initial:"K", here:0,
    era:"Deep void · three weeks past the last named port",
    blurb:"A voidborn freighter, far out from the last port that knew its name. Something in the cargo bay is humming back, and the manifest lists one crate more than was loaded.",
    tone:[["high","scale"],["medium","dread"],["low","comedy"]], dinkus:"✦",
    inspirations:["Alien","The Expanse","Solaris"],
    art:"radial-gradient(70% 60% at 72% 30%, #e8a838 0%, transparent 36%), radial-gradient(120% 100% at 25% 80%, #2c5f8a 0%, #1a2740 40%, transparent 70%), linear-gradient(180deg, #0d1117 0%, #060a12 80%)" }),
  W({ slug:"space_opera/halcyon_drift", genre:"space_opera", world:"Halcyon Drift", initial:"H", here:1,
    era:"The free port · where every flag is welcome and none is trusted",
    blurb:"A ring station spinning at the edge of charted space, all neon bazaars and quiet airlocks. Everyone here is running from somewhere. The docking fees are murder.",
    tone:[["high","scale"],["medium","intrigue"],["medium","comedy"]], dinkus:"✦",
    inspirations:["Babylon 5","Deep Space Nine","Cowboy Bebop"],
    art:"radial-gradient(80% 70% at 30% 26%, #6fa8e0 0%, #2c5f8a 36%, transparent 62%), radial-gradient(70% 60% at 82% 88%, #e8a838 0%, transparent 42%), linear-gradient(180deg, #101826 0%, #080c14 82%)" }),

  // ── Neon Dystopia ──
  W({ slug:"neon_dystopia/spindrift", genre:"neon_dystopia", world:"Spindrift", initial:"S", here:1,
    era:"A drowned coast · the late corporate years",
    blurb:"A floating ring of corporate enclaves above a drowned city. Two of your fixers are dead, and the third is suddenly very polite. The rain up here never stops being someone's idea.",
    tone:[["high","chrome"],["high","stakes"],["medium","weirdness"]], dinkus:"◆",
    inspirations:["Gibson's Sprawl","Blade Runner","Altered Carbon"],
    art:"radial-gradient(80% 70% at 78% 22%, #c264c2 0%, transparent 48%), radial-gradient(90% 80% at 18% 86%, #1fb6b6 0%, transparent 52%), linear-gradient(180deg, #14101c 0%, #0a0a0f 75%)" }),
  W({ slug:"neon_dystopia/lethe_heights", genre:"neon_dystopia", world:"Lethe Heights", initial:"L", here:0,
    era:"The arcology · ninety floors of forgetting",
    blurb:"A vertical city where memory is a metered utility and the penthouse never loses power. Someone has been editing the building's recollection of last Tuesday. You were there.",
    tone:[["high","chrome"],["high","stakes"],["high","weirdness"]], dinkus:"◆",
    inspirations:["Paprika","Ghost in the Shell","Inception"],
    art:"radial-gradient(80% 70% at 24% 22%, #39d8d8 0%, transparent 46%), radial-gradient(90% 80% at 82% 90%, #c264c2 0%, transparent 50%), linear-gradient(180deg, #0e1018 0%, #08080e 78%)" }),

  // ── Mutant Wasteland ──
  W({ slug:"mutant_wasteland/flickering_reach", genre:"mutant_wasteland", world:"Flickering Reach", initial:"F", here:0,
    era:"After · salt flats and old highways",
    blurb:"Salt flats, old highways, and a sky the colour of weak tea. The water trader said he'd be in Kilo by dusk. Dusk has been and gone, and the Geiger counter won't settle.",
    tone:[["high","grit"],["high","scarcity"],["medium","mutation"]], dinkus:"☢",
    inspirations:["Roadside Picnic","Fallout","Annihilation"],
    art:"radial-gradient(100% 80% at 50% 16%, #b6a13a 0%, #6e5a1e 34%, transparent 62%), radial-gradient(90% 70% at 80% 95%, #ff6600 0%, transparent 46%), linear-gradient(180deg, #2a2a1a 0%, #1a1a0e 78%)" }),
  W({ slug:"mutant_wasteland/the_glassworks", genre:"mutant_wasteland", world:"The Glassworks", initial:"G", here:0,
    era:"The crater · where the sand went to glass",
    blurb:"A blast-fused plain that sings when the wind crosses it, and a settlement that mines the old war for parts. The singing has words now, if you stay out past dark to listen.",
    tone:[["high","grit"],["medium","mutation"],["medium","wonder"]], dinkus:"☢",
    inspirations:["Stalker","The Drowned World","Mad Max: Fury Road"],
    art:"radial-gradient(90% 70% at 60% 20%, #9bc46a 0%, #4a7c2e 32%, transparent 58%), radial-gradient(100% 80% at 22% 98%, #5a3410 0%, transparent 52%), linear-gradient(180deg, #26281a 0%, #14150d 80%)" }),

  // ── Road Warrior ──
  W({ slug:"road_warrior/the_long_salt", genre:"road_warrior", world:"The Long Salt", initial:"S", here:0,
    era:"The convoy roads · the third year of drought",
    blurb:"A thousand miles of cracked highway and one tanker worth more than all of it. The engines never fully stop. Neither do the people who want what you're hauling.",
    tone:[["high","velocity"],["high","scarcity"],["low","mercy"]], dinkus:"⛟",
    inspirations:["Mad Max 2","Death Race","The Cannonball Run (but grim)"],
    art:"radial-gradient(100% 80% at 50% 18%, #c8893f 0%, #7a3b1a 36%, transparent 64%), radial-gradient(90% 70% at 80% 96%, #3a2410 0%, transparent 50%), linear-gradient(180deg, #4a2e18 0%, #241509 80%)" }),
  W({ slug:"road_warrior/carrion_mile", genre:"road_warrior", world:"Carrion Mile", initial:"C", here:0,
    era:"The wrecking stretch · a market built from collisions",
    blurb:"A junkyard town strung along a death-race circuit, where every fortune is somebody's wreck. The next heat starts at sundown and you're three cars short of a crew.",
    tone:[["high","velocity"],["medium","spectacle"],["low","mercy"]], dinkus:"⛟",
    inspirations:["Twisted Metal","Rollerball","Redline"],
    art:"radial-gradient(90% 70% at 36% 22%, #d08a3e 0%, #6a3414 34%, transparent 60%), radial-gradient(100% 80% at 84% 98%, #2a1810 0%, transparent 52%), linear-gradient(180deg, #3e2814 0%, #1e120a 80%)" }),

  // ── Spaghetti Western ──
  W({ slug:"spaghetti_western/perdition", genre:"spaghetti_western", world:"Perdition", initial:"P", here:0,
    era:"The border country · a town the railroad forgot",
    blurb:"One street, two saloons, and a noon that never seems to come quietly. The marshal left on the morning coach. The man you're looking for didn't.",
    tone:[["high","standoff"],["medium","dust"],["low","mercy"]], dinkus:"✶",
    inspirations:["Once Upon a Time in the West","The Good, the Bad and the Ugly","Django"],
    art:"radial-gradient(80% 70% at 50% 22%, #e8c878 0%, #b8893a 34%, transparent 62%), radial-gradient(100% 80% at 50% 100%, #6a4420 0%, transparent 58%), linear-gradient(180deg, #c89a54 0%, #5a3c1e 78%)" }),

  // ── Pulp Noir ──
  W({ slug:"pulp_noir/half_past_eleven", genre:"pulp_noir", world:"Half Past Eleven", initial:"H", here:0,
    era:"The city · a wet night, no particular year",
    blurb:"A diner on a side street, rain on the window, the door bell rings. She walks in like she's owed something. The coffee's bad and the night is young and neither will improve.",
    tone:[["high","shadow"],["high","smoke"],["low","mercy"]], dinkus:"✦",
    inspirations:["Chandler","Double Indemnity","L.A. Confidential"],
    art:"radial-gradient(70% 60% at 74% 26%, #d4a017 0%, transparent 40%), radial-gradient(120% 100% at 30% 96%, #3a2e12 0%, transparent 60%), linear-gradient(180deg, #1a1510 0%, #0d0d0d 82%)" }),
  W({ slug:"pulp_noir/the_blue_parrot", genre:"pulp_noir", world:"The Blue Parrot", initial:"B", here:0,
    era:"The harbour district · the season the ships stopped",
    blurb:"A club where the band plays through the raids and everyone's papers are almost in order. The owner owes a favour to the wrong people. Tonight they came to collect.",
    tone:[["high","smoke"],["medium","intrigue"],["low","mercy"]], dinkus:"✦",
    inspirations:["Casablanca","The Maltese Falcon","Touch of Evil"],
    art:"radial-gradient(70% 60% at 30% 26%, #C4A35A 0%, transparent 42%), radial-gradient(110% 90% at 80% 98%, #2a2410 0%, transparent 58%), linear-gradient(180deg, #181410 0%, #0b0b0b 82%)" }),

  // ── Heavy Metal ──
  W({ slug:"heavy_metal/throne_of_ash", genre:"heavy_metal", world:"Throne of Ash", initial:"T", here:0,
    era:"The blasted realm · the age of the last riff",
    blurb:"A bronze-and-bone kingdom under a bleeding sky, where war is sung and the dead keep time. The Ashen King has called the bands to muster. Your axe is overdue an answer.",
    tone:[["high","fury"],["high","spectacle"],["low","mercy"]], dinkus:"⛧",
    inspirations:["Heavy Metal (1981)","Brütal Legend","Elric of Melniboné"],
    art:"radial-gradient(70% 60% at 50% 30%, #c0414b 0%, #5a0e16 30%, transparent 56%), radial-gradient(120% 90% at 50% 102%, #2a2a30 0%, transparent 60%), linear-gradient(180deg, #1a1216 0%, #0a0608 82%)" }),
];

window.SQ_TONE_GLYPH = { low:"▾", medium:"◇", high:"▴" };

window.SQ_HISTORY = [
  { name:"Eleanor", slug:"tea_and_murder/curfew", world:"Curfew at Avely", genreLabel:"Tea & Murder", mode:"solo", when:"yesterday" },
  { name:"Lenny", slug:"caverns_and_claudes/the_old_keep", world:"The Old Keep", genreLabel:"Caverns & Claudes", mode:"multiplayer", when:"3 days ago" },
  { name:"Vesh", slug:"space_opera/halcyon_drift", world:"Halcyon Drift", genreLabel:"Space Opera", mode:"solo", when:"last week" },
];

window.SQ_SESSIONS = {
  "caverns_and_claudes/the_old_keep":[{ players:"Lenny · Alex · Mara · Sebastien", turn:47, location:"The Sunken Stair", mode:"sealed turn" }],
  "low_fantasy/glenross":[{ players:"Rosa · Idris", turn:12, location:"The Conservatory", mode:null }],
  "neon_dystopia/spindrift":[{ players:"Cass", turn:8, location:"Enclave Seven", mode:"cutscene" }],
  "tea_and_murder/the_lavender_line":[{ players:"Margery", turn:3, location:"Carriage C", mode:null }],
  "space_opera/halcyon_drift":[{ players:"Vesh", turn:21, location:"Dock 14", mode:null }],
};

window.SQ_SCENES = [
  { name:"rose-garden-cold-open", genre:"Tea & Murder", desc:"The body, the dew, and the gardener who saw nothing." },
  { name:"kestrel-cargo-hum", genre:"Space Opera", desc:"Cold boot in the cargo bay. The manifest is wrong." },
  { name:"old-keep-third-door", genre:"Caverns & Claudes", desc:"Four torches in. The map disagrees with the wall." },
  { name:"perdition-high-noon", genre:"Spaghetti Western", desc:"One street. The coach already left. He didn't." },
];
