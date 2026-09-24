# Bird call credits

Eighteen short calls, one per bird, from [Wikimedia Commons](https://commons.wikimedia.org/).
Each was checked on its Commons file page for species, creator and licence before use; for
xeno-canto recordings the licence and recordist were also checked on xeno-canto itself.

- **Public domain (12):** US government recordings (NPS, USGS, USFWS) and G. McGrane.
- **CC0 (1):** Black-capped Chickadee.
- **CC BY 4.0 (1):** Barred Owl, from the British Library.
- **CC BY-SA (4):** Wood Duck, Red-tailed Hawk, Great Horned Owl and Pileated Woodpecker.
  These licences allow commercial reuse with attribution and share-alike. Each edited clip is
  under the same licence as its source.

No non-commercial or unverified recordings are used.

**Two birds have no clip and keep the synthesized chirp:**

- **Peregrine Falcon:** the only candidate on Commons was a phone (WhatsApp) recording with no
  location, whose species rests on the uploader's word alone. That's not verified.
- **Wild Turkey:** the verified recordings (xeno-canto, CC BY-SA) are nervous calls and
  foraging clicks. Every short window was faint calls in hiss, not a clear call.

**Edits made to every clip** (by `tools/make_bird_calls.py`, which rebuilds them):

1. Trimmed to the time range listed for the clip.
2. Mixed down to mono and resampled to 32 kHz.
3. Filtered: a high-pass removes rumble and DC offset, a low-pass is added, and a light FFT
   denoise is applied (`afftdn`, 8 dB).
4. Faded in over 30 ms and out over 200 ms.
5. Gain set so the loudest quarter of the call sits at −20 dBFS RMS (modest loudness).
6. A soft-knee limiter above −6 dBFS keeps every peak at or below −3 dBFS.
7. Encoded as a 56 kbps mono MP3 with metadata removed.

The clip-specific filter frequencies and gain are listed with each clip below.

Where noted, the download was Commons' own MP3 transcode of the uploaded file: the same
recording under the same licence. It was used because Wikimedia rate-limited the original.
The xeno-canto recordings were downloaded from xeno-canto (`https://xeno-canto.org/<id>/download`),
the same file Commons mirrors.

---

## american-crow.mp3: American Crow (*Corvus brachyrhynchos*)

- **Source:** [File:Corvus brachyrhynchos call.ogg](https://commons.wikimedia.org/wiki/File:Corvus_brachyrhynchos_call.ogg)
  ("Call of Corvus brachyrhynchos (American Crow)")
- **Creator:** United States Geological Survey, Patuxent Wildlife Research Center
  (transcoded for Commons by User:Superm401)
- **License:** Public domain, a work of the US federal government
  ([PD-USGov-USGS](https://commons.wikimedia.org/wiki/Template:PD-USGov-USGS))
- **Edits:** trimmed to 0.05–1.60 s (1.55 s of caws), high-pass 300 Hz, low-pass 8 kHz,
  gain −9.0 dB, peak −9.1 dBFS. 11 KB.

## common-raven.mp3: Common Raven (*Corvus corax*)

- **Source:** [File:Common Raven Grand Teton National Park.ogg](https://commons.wikimedia.org/wiki/File:Common_Raven_Grand_Teton_National_Park.ogg)
  ("A recording of a Common Raven calling in Grand Teton National Park, Wyoming", 2002-12-13).
  Downloaded as Commons' MP3 transcode.
- **Creator:** National Park Service (Explore Natural Sounds: Common Raven)
- **License:** Public domain, a work of the US National Park Service
  ([PD-USGov-NPS](https://commons.wikimedia.org/wiki/Template:PD-USGov-NPS))
- **Edits:** trimmed to 3.30–5.60 s (2.3 s, two croaks), high-pass 200 Hz, low-pass 8 kHz,
  gain +2.4 dB, peak −8.3 dBFS. 16 KB.

## bald-eagle.mp3: Bald Eagle (*Haliaeetus leucocephalus*)

- **Source:** [File:Bald Eagle Yellowstone National Park.ogg](https://commons.wikimedia.org/wiki/File:Bald_Eagle_Yellowstone_National_Park.ogg)
  ("A recording of a Bald Eagle at Yellowstone National Park")
- **Creator:** National Park Service (Natural Sounds gallery)
- **License:** Public domain, a work of the US National Park Service
  ([PD-USGov-NPS](https://commons.wikimedia.org/wiki/Template:PD-USGov-NPS))
- **Edits:** trimmed to 0.40–2.30 s (1.9 s of chittering), high-pass 600 Hz, low-pass 10 kHz,
  gain −7.7 dB, peak −11.0 dBFS. 13 KB.

## northern-cardinal.mp3: Northern Cardinal (*Cardinalis cardinalis*)

- **Source:** [File:Northern Cardinal.ogg](https://commons.wikimedia.org/wiki/File:Northern_Cardinal.ogg)
  ("Northern Cardinals in Gainesville, FL, and Wilkes County, NC"). Downloaded as Commons'
  MP3 transcode.
- **Creator:** G. McGrane (own work)
- **License:** Public domain, released by the author
  ([PD-self](https://commons.wikimedia.org/wiki/Template:PD-self))
- **Edits:** trimmed to 265.70–268.25 s of the 4.5-minute recording (2.55 s, five
  "cheer" whistles), high-pass 1.2 kHz, low-pass 8 kHz, gain +2.5 dB, limited to a
  peak of −3.0 dBFS. 18 KB.

## wood-duck.mp3: Wood Duck (*Aix sponsa*)

- **Source:** [File:Aix sponsa - Wood Duck - XC63109.ogg](https://commons.wikimedia.org/wiki/File:Aix_sponsa_-_Wood_Duck_-_XC63109.ogg)
  (xeno-canto [XC63109](https://www.xeno-canto.org/63109), Powderhorn Park, Minneapolis,
  2010-10-13). Downloaded as Commons' MP3 transcode.
- **Creator:** Jonathon Jongsma
- **License:** [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/)
- **Edits:** trimmed to 5.00–6.10 s (1.1 s, one squeal call), high-pass 500 Hz,
  low-pass 9 kHz, gain −10.0 dB, peak −13.9 dBFS. 8 KB.
- **This edited clip** is also licensed under
  [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/), as the licence requires.

## osprey.mp3: Osprey (*Pandion haliaetus*)

- **Source:** [File:Pandion haliaetus.ogg](https://commons.wikimedia.org/wiki/File:Pandion_haliaetus.ogg)
  ("Call of the Osprey (Pandion haliaetus)"). Downloaded as Commons' MP3 transcode.
- **Creator:** National Park Service (Wind Cave National Park bird list,
  `nps.gov/archive/wica/Bird_List.htm`); the individual recordist isn't named.
- **License:** Public domain, a work of the US National Park Service
  ([PD-USGov-NPS](https://commons.wikimedia.org/wiki/Template:PD-USGov-NPS))
- **Edits:** trimmed to 0.00–0.72 s (three clean whistles; the source clips after that),
  high-pass 900 Hz, low-pass 9 kHz, gain −7.8 dB, peak −12.4 dBFS. 5 KB.

## red-tailed-hawk.mp3: Red-tailed Hawk (*Buteo jamaicensis*)

- **Source:** [File:Buteo jamaicensis - Red-tailed Hawk XC71575.mp3](https://commons.wikimedia.org/wiki/File:Buteo_jamaicensis_-_Red-tailed_Hawk_XC71575.mp3)
  = xeno-canto [XC71575](https://xeno-canto.org/71575) ("Red-tailed Hawk call recorded at Dordt
  College Prairie, Sioux, Iowa", 2011-02-12)
- **Creator:** Jonathon Jongsma
- **License:** [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) (same on Commons and xeno-canto)
- **Edits:** trimmed to 0.30–1.95 s (one scream), high-pass 600 Hz, low-pass 10 kHz, gain −10.1 dB,
  peak −11.6 dBFS. 11 KB. **This edited clip** is also licensed under CC BY-SA 3.0.

## barred-owl.mp3: Barred Owl (*Strix varia*)

- **Source:** [File:Barred Owl (Strix varia) (W1CDR0000351 BD27).ogg](https://commons.wikimedia.org/wiki/File:Barred_Owl_(Strix_varia)_(W1CDR0000351_BD27).ogg)
  ("Barred Owl song, recorded in Florida, USA"). Downloaded as Commons' MP3 transcode.
- **Creator:** The British Library, Wildlife Sounds collection (W1CDR0000351 BD27; uploaded by the
  British Library, VRTS permission confirmed); the individual recordist isn't named.
- **License:** [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
- **Edits:** trimmed to 0.70–4.80 s (one "who-cooks-for-you" phrase), high-pass 200 Hz,
  low-pass 6 kHz, gain +0.1 dB, peak −10.5 dBFS. 28 KB.

## great-horned-owl.mp3: Great Horned Owl (*Bubo virginianus*)

- **Source:** [File:Bubo virginianus - Great Horned Owl XC450919.mp3](https://commons.wikimedia.org/wiki/File:Bubo_virginianus_-_Great_Horned_Owl_XC450919.mp3)
  = xeno-canto [XC450919](https://xeno-canto.org/450919) ("Great Horned Owl call from Anderson
  Township near Cincinnati, Hamilton County, Ohio", 2019-01-11; the recordist applied noise
  reduction and +3 dB)
- **Creator:** Michael & Katie LaTour
- **License:** [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) (same on Commons and xeno-canto)
- **Edits:** trimmed to 0.00–4.40 s (one hoot phrase), high-pass 120 Hz, low-pass 3 kHz,
  gain +15.7 dB, peak −12.7 dBFS. 30 KB. **This edited clip** is also licensed under CC BY-SA 4.0.

## blue-jay.mp3: Blue Jay (*Cyanocitta cristata*)

- **Source:** [File:Blue Jay.ogg](https://commons.wikimedia.org/wiki/File:Blue_Jay.ogg)
  ("Blue Jays in Florida and North Carolina", 2000). Downloaded as Commons' MP3 transcode.
- **Creator:** G. McGrane (own work)
- **License:** Public domain, released by the author
  ([PD-self](https://commons.wikimedia.org/wiki/Template:PD-self))
- **Edits:** trimmed to 20.10–21.75 s (two "jay" calls), high-pass 700 Hz, low-pass 10 kHz,
  gain −4.0 dB, peak −12.6 dBFS. 11 KB.

## american-robin.mp3: American Robin (*Turdus migratorius*)

- **Source:** [File:American Robin Yellowstone National Park.ogg](https://commons.wikimedia.org/wiki/File:American_Robin_Yellowstone_National_Park.ogg)
  ("A recording of an American Robin at Yellowstone National Park", 2005-04-19). Downloaded as
  Commons' MP3 transcode.
- **Creator:** National Park Service (Natural Sounds gallery)
- **License:** Public domain, a work of the US National Park Service
  ([PD-USGov-NPS](https://commons.wikimedia.org/wiki/Template:PD-USGov-NPS))
- **Edits:** trimmed to 0.20–2.20 s (a run of calls), high-pass 1.2 kHz, low-pass 10 kHz,
  gain −5.5 dB, peak −7.4 dBFS. 14 KB.

## black-capped-chickadee.mp3: Black-capped Chickadee (*Poecile atricapillus*)

- **Source:** [File:Black-capped Chickadee 201947598.wav](https://commons.wikimedia.org/wiki/File:Black-capped_Chickadee_201947598.wav)
  ("Call of a black-capped chickadee found in Calgary's Griffith Woods Park"). Downloaded as
  Commons' MP3 transcode.
- **Creator:** *ngoomie (own work)
- **License:** [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)
- **Edits:** trimmed to 0.05–1.30 s (one "chick-a-dee-dee"), high-pass 1.5 kHz, low-pass 12 kHz,
  gain +3.0 dB, peak −5.1 dBFS. 9 KB.

## tufted-titmouse.mp3: Tufted Titmouse (*Baeolophus bicolor*)

- **Source:** [File:Tufted Titmouse call.ogg](https://commons.wikimedia.org/wiki/File:Tufted_Titmouse_call.ogg)
  ("A sound recording of a tufted titmouse bird call."). Downloaded as Commons' MP3 transcode.
- **Creator:** U.S. Fish and Wildlife Service
- **License:** Public domain, a work of the US Fish and Wildlife Service
  ([PD-USGov-FWS](https://commons.wikimedia.org/wiki/Template:PD-USGov-FWS))
- **Edits:** trimmed to 0.90–3.30 s (two call bursts), high-pass 3 kHz (removes hum), low-pass
  12 kHz, gain −0.3 dB, peak −6.4 dBFS. 17 KB.

## pileated-woodpecker.mp3: Pileated Woodpecker (*Dryocopus pileatus*)

- **Source:** [File:Dryocopus pileatus - Pileated Woodpecker XC61518.mp3](https://commons.wikimedia.org/wiki/File:Dryocopus_pileatus_-_Pileated_Woodpecker_XC61518.mp3)
  = xeno-canto [XC61518](https://xeno-canto.org/61518) (call, Tettegouche State Park, Lake,
  Minnesota, 2010-08-31)
- **Creator:** Jonathon Jongsma
- **License:** [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) (same on Commons and xeno-canto)
- **Edits:** trimmed to 1.75–3.40 s (one call series), high-pass 500 Hz, low-pass 10 kHz,
  gain −9.4 dB, peak −10.9 dBFS. 11 KB. **This edited clip** is also licensed under CC BY-SA 3.0.

## belted-kingfisher.mp3: Belted Kingfisher (*Megaceryle alcyon*)

- **Source:** [File:Megaceryle alcyon.ogg](https://commons.wikimedia.org/wiki/File:Megaceryle_alcyon.ogg)
  ("Call of the Belted Kingfisher (Megaceryle alcyon)"). Downloaded as Commons' MP3 transcode.
- **Creator:** National Park Service (Wind Cave National Park bird list); the individual recordist
  isn't named.
- **License:** Public domain, a work of the US National Park Service
  ([PD-USGov-NPS](https://commons.wikimedia.org/wiki/Template:PD-USGov-NPS))
- **Edits:** trimmed to 0.35–2.30 s (a rattle), high-pass 1 kHz, low-pass 10 kHz, gain +12.9 dB,
  peak −6.4 dBFS. 14 KB.

## great-blue-heron.mp3: Great Blue Heron (*Ardea herodias*)

- **Source:** [File:Great Blue Heron.ogg](https://commons.wikimedia.org/wiki/File:Great_Blue_Heron.ogg)
  ("Call of the Great Blue Heron (Ardea herodias)"). Downloaded as Commons' MP3 transcode.
- **Creator:** National Park Service (Wind Cave National Park bird list); the individual recordist
  isn't named.
- **License:** Public domain, a work of the US National Park Service
  ([PD-USGov-NPS](https://commons.wikimedia.org/wiki/Template:PD-USGov-NPS))
- **Edits:** trimmed to 0.10–1.20 s (two croaks), high-pass 500 Hz, low-pass 8 kHz, gain −5.3 dB,
  peak −7.3 dBFS. 8 KB.

## canada-goose.mp3: Canada Goose (*Branta canadensis*)

- **Source:** [File:Branta canadensis.ogg](https://commons.wikimedia.org/wiki/File:Branta_canadensis.ogg)
  ("Call of the Canada Goose (Branta canadensis)")
- **Creator:** National Park Service (Wind Cave National Park bird list); the individual recordist
  isn't named.
- **License:** Public domain, a work of the US National Park Service
  ([PD-USGov-NPS](https://commons.wikimedia.org/wiki/Template:PD-USGov-NPS))
- **Edits:** trimmed to 0.15–1.70 s (two honks), high-pass 250 Hz, low-pass 5 kHz (the source is
  11 kHz), gain −7.1 dB, peak −7.7 dBFS. 11 KB.

## ruby-throated-hummingbird.mp3: Ruby-throated Hummingbird (*Archilochus colubris*)

- **Source:** [File:Archilochus colubris.ogg](https://commons.wikimedia.org/wiki/File:Archilochus_colubris.ogg)
  ("Call of the Ruby-throated Hummingbird (Archilochus colubris)"). Downloaded as Commons' MP3
  transcode.
- **Creator:** National Park Service (Wind Cave National Park bird list); the individual recordist
  isn't named.
- **License:** Public domain, a work of the US National Park Service
  ([PD-USGov-NPS](https://commons.wikimedia.org/wiki/Template:PD-USGov-NPS))
- **Edits:** trimmed to 0.00–1.05 s (a chip-twitter series), high-pass 2 kHz, low-pass 12 kHz,
  gain +4.7 dB, peak −7.7 dBFS. 7 KB.
