/* Shared application logic: catalogue storage, the matching rules,
   and the mapping from a model to its catalogue PDF. */
(function () {
  'use strict';

  var STORAGE_KEY = 'perio.catalogue';
  var CLASS_STORAGE_KEY = 'perio.classes';
  var THEME_KEY = 'perio.theme';
  var UNCLASSIFIED = 'Unclassified';

  /* ---------------------------------------------------------------- numbers */

  function round(value, places) {
    var factor = Math.pow(10, places === undefined ? 2 : places);
    return Math.round(value * factor) / factor;
  }

  function mm(value) {
    var rounded = round(value, 2);
    return Math.abs(rounded % 1) < 0.001 ? rounded.toFixed(1) : String(rounded);
  }

  /* --------------------------------------------------------- catalogue PDFs */

  var CATALOGUES = [
    {
      file: 'Megagen Anyridge.pdf',
      title: 'AnyRidge',
      brand: 'MegaGen',
      matches: function (brand, model) { return /anyridge/i.test(model); }
    },
    {
      file: 'Megagen Blue Diamond.pdf',
      title: 'Blue Diamond',
      brand: 'MegaGen',
      matches: function (brand, model) { return /blue\s*diamond/i.test(model); }
    },
    {
      file: 'Omnitaper.pdf',
      title: 'OmniTaper EV',
      brand: 'Omnitaper',
      matches: function (brand, model) { return /omnitaper/i.test(brand) || /omnitaper/i.test(model); }
    },
    {
      file: 'Straumann BLX.pdf',
      title: 'BLX',
      brand: 'Straumann',
      matches: function (brand, model) { return /straumann/i.test(brand) && /\bblx\b/i.test(model); }
    },
    {
      file: 'Straumann SP - BLT.pdf',
      title: 'Standard, Standard Plus & Bone Level',
      brand: 'Straumann',
      matches: function (brand) { return /straumann/i.test(brand); }
    }
  ];

  function catalogueFor(brand, model) {
    for (var i = 0; i < CATALOGUES.length; i++) {
      if (CATALOGUES[i].matches(brand || '', model || '')) return CATALOGUES[i];
    }
    return null;
  }

  function cataloguePath(catalogue) {
    return 'Catalogues/' + encodeURIComponent(catalogue.file);
  }

  /* -------------------------------------------------- building the data set */

  /* ------------------------------------------------------- reading a sheet */

  /* Both workbooks start with a "Brand Name" header row, so the header is
     located the same way for either one and the columns are then found by
     their labels rather than by position. */
  function findHeader(rows) {
    for (var i = 0; i < rows.length; i++) {
      var first = rows[i].values[0];
      if (typeof first === 'string' && /brand/i.test(first)) {
        return { index: i, labels: rows[i].values };
      }
    }
    return null;
  }

  function columnFor(labels, pattern, fallback) {
    for (var i = 0; i < labels.length; i++) {
      if (typeof labels[i] === 'string' && pattern.test(labels[i])) return i;
    }
    return fallback;
  }

  /* Which of the two workbooks is this? */
  function sheetKind(rows) {
    var header = findHeader(rows);
    if (!header) return null;
    var labels = header.labels.filter(function (label) { return typeof label === 'string'; });
    var joined = labels.join(' | ');
    if (/class/i.test(joined)) return 'classes';
    if (/diameter/i.test(joined) && /length/i.test(joined)) return 'catalogue';
    return null;
  }

  function text(value) {
    return value === null || value === undefined ? '' : String(value).trim();
  }

  /* Turns raw spreadsheet rows into the same shape as data/implants.js.
     Throws an Error with a readable message when the sheet does not match
     the expected Brand / Model / Diameter / Length layout. */
  function buildFromRows(rows, fileName) {
    var header = findHeader(rows);
    if (!header) {
      throw new Error('No header row found. The sheet needs a row starting with "Brand Name", followed by Model, Diameter and Length.');
    }

    var headerIndex = header.index;
    var brandColumn = columnFor(header.labels, /brand/i, 0);
    var modelColumn = columnFor(header.labels, /model/i, 1);
    var diameterColumn = columnFor(header.labels, /diameter|width/i, 2);
    var lengthColumn = columnFor(header.labels, /length|height/i, 3);

    var groups = [];
    var index = {};
    var problems = [];
    var count = 0;

    for (var r = headerIndex + 1; r < rows.length; r++) {
      var values = rows[r].values;
      var brand = values[brandColumn];
      var model = values[modelColumn];
      var diameter = values[diameterColumn];
      var length = values[lengthColumn];

      var empty = [brand, model, diameter, length].every(function (value) {
        return value === null || value === undefined || value === '';
      });
      if (empty) continue;

      brand = text(brand);
      model = text(model);
      diameter = typeof diameter === 'string' ? parseFloat(diameter.replace(',', '.')) : diameter;
      length = typeof length === 'string' ? parseFloat(length.replace(',', '.')) : length;

      if (!brand || !model || typeof diameter !== 'number' || isNaN(diameter) ||
          typeof length !== 'number' || isNaN(length) || diameter <= 0 || length <= 0) {
        problems.push(rows[r].number);
        continue;
      }

      var key = brand.toLowerCase() + '|' + model.toLowerCase();
      if (!index[key]) {
        index[key] = { brand: brand, model: model, sizes: [], seen: {} };
        groups.push(index[key]);
      }
      var group = index[key];
      var size = round(diameter, 2) + 'x' + round(length, 2);
      if (!group.seen[size]) {
        group.seen[size] = true;
        group.sizes.push([round(diameter, 2), round(length, 2)]);
        count++;
      }
    }

    if (problems.length) {
      var shown = problems.slice(0, 8).join(', ');
      throw new Error('Could not read ' + problems.length + ' row' + (problems.length === 1 ? '' : 's') +
        ' (spreadsheet row ' + shown + (problems.length > 8 ? ', ...' : '') +
        '). Every row needs a brand, a model, and numeric diameter and length values.');
    }
    if (!count) {
      throw new Error('The sheet has a header but no implant rows.');
    }

    groups.forEach(function (group) {
      delete group.seen;
      group.sizes.sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
    });

    return {
      version: '1.0',
      source: fileName || 'implant-catalogue.xlsx',
      generated: new Date().toISOString().slice(0, 10),
      entryCount: count,
      models: groups
    };
  }

  /* ----------------------------------------------------------- brand class */

  /* Turns the Brand / Model / Class sheet into the shape of data/classes.js.
     A rule whose model is "All models" (or blank, or *) covers every model
     of that brand; a rule naming a model wins over its brand's rule. */
  function buildClassesFromRows(rows, fileName) {
    var header = findHeader(rows);
    if (!header) {
      throw new Error('No header row found. The sheet needs a row starting with "Brand Name", followed by Model and Class.');
    }

    var brandColumn = columnFor(header.labels, /brand/i, 0);
    var modelColumn = columnFor(header.labels, /model/i, 1);
    var classColumn = columnFor(header.labels, /class/i, 2);

    var rules = [];
    var problems = [];

    for (var r = header.index + 1; r < rows.length; r++) {
      var brand = text(rows[r].values[brandColumn]);
      var model = text(rows[r].values[modelColumn]);
      var className = text(rows[r].values[classColumn]);

      if (!brand && !model && !className) continue;
      if (!brand || !className) { problems.push(rows[r].number); continue; }

      rules.push({ brand: brand, model: model || 'All models', class: className });
    }

    if (problems.length) {
      var shown = problems.slice(0, 8).join(', ');
      throw new Error('Could not read ' + problems.length + ' row' + (problems.length === 1 ? '' : 's') +
        ' (spreadsheet row ' + shown + (problems.length > 8 ? ', ...' : '') +
        '). Every row needs a brand and a class.');
    }
    if (!rules.length) {
      throw new Error('The sheet has a header but no class rows.');
    }

    return {
      version: '1.0',
      source: fileName || 'brand-classes.xlsx',
      generated: new Date().toISOString().slice(0, 10),
      rules: rules
    };
  }

  function isWildcard(model) {
    return !model || /^(all models|all|any|\*)$/i.test(model);
  }

  function classFor(rules, brand, model) {
    var brandRule = null;

    for (var i = 0; i < rules.length; i++) {
      var rule = rules[i];
      if (rule.brand.toLowerCase() !== String(brand).toLowerCase()) continue;
      if (isWildcard(rule.model)) { if (!brandRule) brandRule = rule; continue; }
      if (rule.model.toLowerCase() === String(model).toLowerCase()) return rule.class;
    }
    return brandRule ? brandRule.class : UNCLASSIFIED;
  }

  /* ------------------------------------------------------- catalogue in use */

  function readStored() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (parsed && parsed.data && parsed.data.models && parsed.data.models.length) return parsed;
    } catch (error) { /* corrupt or unavailable storage falls back to built-in */ }
    return null;
  }

  function readStoredClasses() {
    try {
      var raw = window.localStorage.getItem(CLASS_STORAGE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (parsed && parsed.data && parsed.data.rules && parsed.data.rules.length) return parsed;
    } catch (error) { /* corrupt or unavailable storage falls back to built-in */ }
    return null;
  }

  var stored = readStored();
  var current = stored ? stored.data : (window.IMPLANT_DATA || { models: [], entryCount: 0 });
  var storedClasses = readStoredClasses();
  var currentClasses = storedClasses ? storedClasses.data : (window.CLASS_DATA || { rules: [] });

  /* Every model carries its class, so the planner and the catalogue page
     never have to resolve the rules themselves. */
  function applyClasses() {
    current.models.forEach(function (group) {
      group.class = classFor(currentClasses.rules, group.brand, group.model);
    });
  }

  applyClasses();

  var api = {
    round: round,
    mm: mm,
    catalogues: CATALOGUES,
    catalogueFor: catalogueFor,
    cataloguePath: cataloguePath,
    buildFromRows: buildFromRows,
    buildClassesFromRows: buildClassesFromRows,
    sheetKind: sheetKind,
    UNCLASSIFIED: UNCLASSIFIED,

    data: function () { return current; },
    isCustom: function () { return !!stored; },
    importedAt: function () { return stored ? stored.importedAt : null; },
    sourceName: function () { return stored ? stored.fileName : (current.source || 'implant-catalogue.xlsx'); },

    classData: function () { return currentClasses; },
    isCustomClasses: function () { return !!storedClasses; },
    classesImportedAt: function () { return storedClasses ? storedClasses.importedAt : null; },
    classSourceName: function () {
      return storedClasses ? storedClasses.fileName : (currentClasses.source || 'brand-classes.xlsx');
    },

    use: function (data, fileName) {
      current = data;
      stored = { data: data, fileName: fileName, importedAt: new Date().toISOString() };
      applyClasses();
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
      } catch (error) { /* private browsing: the update still applies for this visit */ }
    },

    useClasses: function (data, fileName) {
      currentClasses = data;
      storedClasses = { data: data, fileName: fileName, importedAt: new Date().toISOString() };
      applyClasses();
      try {
        window.localStorage.setItem(CLASS_STORAGE_KEY, JSON.stringify(storedClasses));
      } catch (error) { /* private browsing: the update still applies for this visit */ }
    },

    reset: function () {
      stored = null;
      current = window.IMPLANT_DATA || { models: [], entryCount: 0 };
      storedClasses = null;
      currentClasses = window.CLASS_DATA || { rules: [] };
      applyClasses();
      try {
        window.localStorage.removeItem(STORAGE_KEY);
        window.localStorage.removeItem(CLASS_STORAGE_KEY);
      } catch (error) { /* ignore */ }
    },

    brands: function () {
      var seen = {};
      var list = [];
      current.models.forEach(function (group) {
        if (!seen[group.brand]) { seen[group.brand] = true; list.push(group.brand); }
      });
      return list.sort();
    },

    /* Classes present in the catalogue, in order, with any unclassified
       models gathered at the end. */
    classes: function () {
      var seen = {};
      var list = [];
      current.models.forEach(function (group) {
        if (!seen[group.class]) { seen[group.class] = true; list.push(group.class); }
      });
      var unclassified = list.indexOf(UNCLASSIFIED) !== -1;
      list = list.filter(function (name) { return name !== UNCLASSIFIED; }).sort();
      if (unclassified) list.push(UNCLASSIFIED);
      return list;
    },

    /* The models each class covers, for the class legend. */
    modelsByClass: function () {
      var map = {};
      current.models.forEach(function (group) {
        if (!map[group.class]) map[group.class] = [];
        map[group.class].push(group.brand + ' ' + group.model);
      });
      return map;
    },

    /* ------------------------------------------------------------- matching */

    /* Diameter: bone diameter minus implant diameter.
         exactly 3.0 mm  -> optimal
         2.0 to 2.99 mm  -> standard
         1.6 to 1.99 mm  -> less preferable
         anything else   -> excluded
       Length: bone length minus implant length.
         0 mm            -> optimal
         up to 2.0 mm    -> standard
         anything else   -> excluded */
    gradeDiameter: function (boneDiameter, implantDiameter) {
      var gap = round(boneDiameter - implantDiameter, 2);
      if (gap === 3) return { grade: 'optimal', gap: gap };
      if (gap >= 2 && gap < 3) return { grade: 'standard', gap: gap };
      if (gap >= 1.6 && gap < 2) return { grade: 'less', gap: gap };
      return null;
    },

    gradeLength: function (boneLength, implantLength) {
      var gap = round(boneLength - implantLength, 2);
      if (gap === 0) return { grade: 'optimal', gap: gap };
      if (gap > 0 && gap <= 2) return { grade: 'standard', gap: gap };
      return null;
    },

    /* The overall grade is the weaker of the two ratings. */
    combine: function (a, b) {
      var order = { optimal: 0, standard: 1, less: 2 };
      return order[a] >= order[b] ? a : b;
    },

    /* filter: { brands: [...], classes: [...] } - an empty list means no
       restriction on that dimension. */
    search: function (boneDiameter, boneLength, filter) {
      var results = [];
      var self = this;
      var brandFilter = (filter && filter.brands) || [];
      var classFilter = (filter && filter.classes) || [];

      current.models.forEach(function (group) {
        if (brandFilter.length && brandFilter.indexOf(group.brand) === -1) return;
        if (classFilter.length && classFilter.indexOf(group.class) === -1) return;
        var catalogue = catalogueFor(group.brand, group.model);

        group.sizes.forEach(function (size) {
          var diameter = self.gradeDiameter(boneDiameter, size[0]);
          if (!diameter) return;
          var length = self.gradeLength(boneLength, size[1]);
          if (!length) return;

          results.push({
            brand: group.brand,
            model: group.model,
            class: group.class,
            diameter: size[0],
            length: size[1],
            diameterGrade: diameter.grade,
            diameterGap: diameter.gap,
            lengthGrade: length.grade,
            lengthGap: length.gap,
            overall: self.combine(diameter.grade, length.grade),
            catalogue: catalogue
          });
        });
      });

      var order = { optimal: 0, standard: 1, less: 2 };
      results.sort(function (a, b) {
        return order[a.overall] - order[b.overall] ||
               a.lengthGap - b.lengthGap ||
               order[a.diameterGrade] - order[b.diameterGrade] ||
               b.diameter - a.diameter ||
               a.brand.localeCompare(b.brand) ||
               a.model.localeCompare(b.model);
      });
      return results;
    },

    /* The diameter and length windows that can produce any result at all,
       used to explain a search that returns nothing. */
    windows: function (boneDiameter, boneLength) {
      return {
        diameter: [round(boneDiameter - 3, 2), round(boneDiameter - 1.6, 2)],
        length: [round(boneLength - 2, 2), round(boneLength, 2)]
      };
    }
  };

  /* ------------------------------------------------------------------ theme */

  api.initTheme = function () {
    var saved = null;
    try { saved = window.localStorage.getItem(THEME_KEY); } catch (error) { /* ignore */ }
    if (saved) document.documentElement.setAttribute('data-theme', saved);

    var button = document.querySelector('[data-theme-toggle]');
    if (!button) return;

    button.addEventListener('click', function () {
      var attribute = document.documentElement.getAttribute('data-theme');
      var dark = attribute === 'dark' ||
        (!attribute && window.matchMedia('(prefers-color-scheme: dark)').matches);
      var next = dark ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try { window.localStorage.setItem(THEME_KEY, next); } catch (error) { /* ignore */ }
    });
  };

  window.PerioApp = api;
})();
