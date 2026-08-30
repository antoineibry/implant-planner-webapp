# Implant Planner — Department of Periodontology

A two-page web app for planning implants from the department's catalogues.

- **Implant Planner** (`index.html`) — enter the bone diameter and bone length measured at the
  implant site; every implant in the catalogue that satisfies the department's rules is listed,
  rated on diameter and on length separately, and filterable by class and by brand.
- **Catalogs** (`catalogs.html`) — one icon per manufacturer catalogue; selecting it opens the PDF
  in a new tab.

The whole app is static files. There is no server, no database engine and no build step.

## Selection rules

**Diameter** — bone diameter minus implant diameter:

| Difference | Rating |
| --- | --- |
| exactly 3.0 mm | Optimal |
| 2.0 – 2.99 mm | Standard |
| 1.6 – 1.99 mm | Less preferable |
| anything else | not shown |

**Length** — bone length minus implant length:

| Difference | Rating |
| --- | --- |
| 0 mm (equal) | Optimal |
| up to 2.0 mm shorter | Standard |
| anything else | not shown |

An implant longer than the bone is never shown. Each result carries its own diameter rating and
its own length rating, and is grouped under the weaker of the two.

**Class and brand** are filters, not rules: with none selected the whole catalogue is searched.
Selecting classes and brands together narrows to implants that satisfy both.

## The catalogue data

`implant-catalogue.xlsx` is the master. Its four columns never change:

    Brand Name | Model | Diameter (mm) | Length (mm)

One row per available diameter/length combination. A brand can have any number of models; a model
belongs to one brand.

`brand-classes.xlsx` holds the class of each brand or model, in three columns:

    Brand Name | Model | Class

A row whose model is `All models` (or blank, or `*`) applies to every model of that brand; a row
naming one model overrides its brand's row for that model. A model no row covers is listed as
`Unclassified` and still appears in results — it is simply grouped under that label in the filter.

The app reads these two workbooks itself, every time a page loads. They currently hold 322 implant
sizes across 18 models in classes A and B.

### Updating the data

1. Edit `implant-catalogue.xlsx` or `brand-classes.xlsx` in Excel and save it.
2. Reload the Implant Planner (F5).

That is the whole procedure. There is no import step and no button. Under the results heading a
line always states what is on screen — the number of sizes, models and classes, and which files
they were read from — so you can confirm an edit landed at a glance.

If a row is missing a brand, a model, a class or a number, the sheet is rejected and that line
turns amber naming the spreadsheet row to fix, while the app keeps working on the last good copy.

When the site is hosted, updating means replacing the `.xlsx` on the host the same way you would
replace any other file; the next page load picks it up.

### The copies in `data/`

`data/implants.js` and `data/classes.js` hold a copy of both workbooks, and are used **only** when
the Excel files cannot be read — which happens when `index.html` is opened straight from disk
(`file://`), because browsers do not let a local page read neighbouring files. In that case the app
still works and says which copy it is showing, and how old it is.

If the site is served over http — a local `python -m http.server`, or any host — these files are
never used and can be ignored. They are regenerated from the workbooks whenever the project is
updated.

## Adding a catalogue PDF

Put the PDF in the `Catalogues` folder, then add an entry to the `CATALOGUES` list at the top of
`assets/app.js` — the file name, the brand, the title to display, and the rule that decides which
models it covers. The Catalogs page and the catalogue links in the results pick it up automatically.
Any model with no catalogue on file is named at the bottom of the Catalogs page.

## Hosting

Upload the whole folder — spreadsheets included — to any static host: Netlify (drag the folder onto
app.netlify.com/drop), GitHub Pages, Vercel or a department web server. `index.html` is the entry
point. Nothing else has to be installed or configured.

To run it locally, serve the folder rather than double-clicking `index.html`, so the app can read
the workbooks:

    python -m http.server 5173

then open http://localhost:5173.

Reading the `.xlsx` files uses the browser's built-in decompression, which needs Chrome, Edge,
Firefox or Safari from 2023 or later. Everything else in the app works in any modern browser.

## Files

    index.html              Implant Planner page
    catalogs.html           Catalogs page
    assets/styles.css       All styling, light and dark
    assets/app.js           Catalogue storage, the matching rules, catalogue-to-PDF mapping
    assets/planner.js       Implant Planner page behaviour
    assets/catalogs.js      Catalogs page behaviour
    assets/xlsx.js          Reads the .xlsx files in the browser, no external library
    data/implants.js        Fallback copy of the catalogue, for file:// use
    data/classes.js         Fallback copy of the classes, for file:// use
    implant-catalogue.xlsx  The catalogue the app reads
    brand-classes.xlsx      The classes the app reads
    Catalogues/             Manufacturer catalogue PDFs
"# implant-planner-webapp" 
