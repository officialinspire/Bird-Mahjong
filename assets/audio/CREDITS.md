# Bird call credits

Five short calls, one per tile, all from [Wikimedia Commons](https://commons.wikimedia.org/).
Each was checked on its Commons file page for species, creator and licence before use.
Four are in the public domain. The Wood Duck is CC BY-SA 3.0, which allows commercial reuse
with attribution and share-alike. No non-commercial or unverified recordings are used.

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
