// Renders the tile gallery from data/tiles.json (names) + data/crops.json (files).
// All paths are relative so the site works from any GitHub Pages sub-path.
(async function () {
  const list = document.getElementById("tiles");
  const status = document.getElementById("status");

  try {
    const [names, crops] = await Promise.all(
      ["data/tiles.json", "data/crops.json"].map((url) =>
        fetch(url).then((r) => {
          if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
          return r.json();
        })
      )
    );
    const byId = new Map(names.tiles.map((t) => [t.id, t]));

    for (const crop of crops.tiles) {
      const info = byId.get(crop.id) || {};
      const li = document.createElement("li");
      li.className = "tile";
      li.dataset.tileId = crop.id;

      const img = document.createElement("img");
      img.src = crop.file;
      img.alt = crop.name;
      img.width = crop.box.width;
      img.height = crop.box.height;
      img.loading = "lazy";

      const h2 = document.createElement("h2");
      h2.textContent = `${String(crop.index).padStart(2, "0")} · ${crop.name}`;

      const id = document.createElement("div");
      id.className = "id";
      id.textContent = crop.id;

      const notes = document.createElement("p");
      notes.textContent = info.notes || "";

      li.append(img, h2, id, notes);
      list.append(li);
    }
    status.remove();
  } catch (err) {
    status.textContent =
      `Could not load tile data (${err.message}). ` +
      "If you opened index.html directly from disk, serve the folder over HTTP instead (see README).";
  }
})();
