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

`data/implants.js` and `data/classes.js` are the copies the web app actually reads — the same data,
grouped so the browser can load it instantly. They currently hold 231 implant sizes across 14
models, in classes A and B.

### Updating the data

1. Edit `implant-catalogue.xlsx` or `brand-classes.xlsx` in Excel and save it.
2. Open the Implant Planner and press **Update catalogue**.
3. Choose the Excel file (or drop it on the panel).

Either workbook is accepted: the planner recognises which one it is from the column headers and
replaces only that part of the data. It reads the workbook in the browser and starts using it
immediately. The file is checked first: if a row is missing a brand, a model, a class or a number,
nothing is replaced and the message names the spreadsheet row to fix.

That update lives in the browser that made it. To make it the default **for everyone**:

4. In the same dialog, press **implants.js** or **classes.js** under Download.
5. Put the downloaded file into the website's `data` folder, replacing the old one, and re-upload
   the site.

**Restore built-in data** discards a browser's uploaded copies and returns to the files in `data`.

## Adding a catalogue PDF

Put the PDF in the `Catalogues` folder, then add an entry to the `CATALOGUES` list at the top of
`assets/app.js` — the file name, the brand, the title to display, and the rule that decides which
models it covers. The Catalogs page and the catalogue links in the results pick it up automatically.
Any model with no catalogue on file is named at the bottom of the Catalogs page.

## Hosting

Upload the whole folder to any static host — Netlify (drag the folder onto app.netlify.com/drop),
GitHub Pages, Vercel or a department web server. `index.html` is the entry point. Nothing else has
to be installed or configured.

Reading an uploaded `.xlsx` uses the browser's built-in decompression, which needs Chrome, Edge,
Firefox or Safari from 2023 or later. Everything else in the app works in any modern browser.

## Files

    index.html              Implant Planner page
    catalogs.html           Catalogs page
    assets/styles.css       All styling, light and dark
    assets/app.js           Catalogue storage, the matching rules, catalogue-to-PDF mapping
    assets/planner.js       Implant Planner page behaviour
    assets/catalogs.js      Catalogs page behaviour
    assets/xlsx.js          Reads .xlsx files in the browser, no external library
    data/implants.js        The catalogue the app reads
    data/classes.js         The class of each brand or model
    implant-catalogue.xlsx  The master catalogue spreadsheet
    brand-classes.xlsx      The master class spreadsheet
    Catalogues/             Manufacturer catalogue PDFs
"# implant-planner-webapp" 
