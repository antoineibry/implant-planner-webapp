/* Implant Planner page */
(function () {
  'use strict';

  var App = window.PerioApp;
  var INPUT_KEY = 'perio.lastMeasurements';

  var GROUPS = [
    { key: 'optimal', label: 'Optimal', note: 'meets the preferred diameter and length rules' },
    { key: 'standard', label: 'Standard', note: 'acceptable on both rules' },
    { key: 'less', label: 'Less preferable', note: 'usable, but the narrowest accepted bone margin' }
  ];

  var GRADE_LABEL = { optimal: 'Optimal', standard: 'Standard', less: 'Less preferable' };

  var diameterInput = document.getElementById('bone-diameter');
  var lengthInput = document.getElementById('bone-length');
  var brandFilter = document.getElementById('brand-filter');
  var classFilter = document.getElementById('class-filter');
  var classHint = document.getElementById('class-hint');
  var resultsBox = document.getElementById('results');
  var countBox = document.getElementById('results-count');
  var contextBox = document.getElementById('results-context');
  var activeBrands = [];
  var activeClasses = [];

  /* -------------------------------------------------------------- helpers */

  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function badge(grade) {
    return element('span', 'badge badge--' + grade, GRADE_LABEL[grade]);
  }

  function classTag(name) {
    var tag = element('span', 'class-tag', name === App.UNCLASSIFIED ? name : 'Class ' + name);
    tag.title = 'Implant class';
    return tag;
  }

  function pdfIcon() {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.9');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    var a = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    a.setAttribute('d', 'M14 4h6v6');
    var b = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    b.setAttribute('d', 'M20 4 11 13');
    var c = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    c.setAttribute('d', 'M18 14.5v4A1.5 1.5 0 0 1 16.5 20h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6h4');
    svg.appendChild(a); svg.appendChild(b); svg.appendChild(c);
    return svg;
  }

  function readNumber(input) {
    var value = parseFloat(input.value);
    return isNaN(value) || value <= 0 ? null : App.round(value, 2);
  }

  /* ----------------------------------------------- class and brand filters */

  /* A chip toggles one value in `active`; with nothing selected the filter
     places no restriction at all. */
  function renderChips(container, values, active, label) {
    container.innerHTML = '';

    values.forEach(function (value) {
      var chip = element('button', 'chip', label ? label(value) : value);
      chip.type = 'button';
      chip.setAttribute('aria-pressed', active.indexOf(value) !== -1 ? 'true' : 'false');
      chip.addEventListener('click', function () {
        var index = active.indexOf(value);
        if (index === -1) active.push(value); else active.splice(index, 1);
        chip.setAttribute('aria-pressed', index === -1 ? 'true' : 'false');
        run();
      });
      container.appendChild(chip);
    });
  }

  function renderFilters() {
    var brands = App.brands();
    activeBrands = activeBrands.filter(function (brand) { return brands.indexOf(brand) !== -1; });
    renderChips(brandFilter, brands, activeBrands);

    var classes = App.classes();
    activeClasses = activeClasses.filter(function (name) { return classes.indexOf(name) !== -1; });
    renderChips(classFilter, classes, activeClasses, function (name) {
      return name === App.UNCLASSIFIED ? name : 'Class ' + name;
    });

    var byClass = App.modelsByClass();
    classHint.textContent = classes.map(function (name) {
      return (name === App.UNCLASSIFIED ? name : 'Class ' + name) + ': ' + byClass[name].length +
        (byClass[name].length === 1 ? ' model' : ' models');
    }).join(' · ');
  }

  /* --------------------------------------------------------------- results */

  /* One measurement of the implant: the value, how it was rated on its own
     rule, and the difference from the bone measurement it was rated against. */
  function metricCell(label, value, unit, grade, note) {
    var cell = element('td', 'cell-metric');
    cell.setAttribute('data-label', label);

    var line = element('div', 'cell-metric__line');
    var dimension = element('span', 'dim', value);
    dimension.appendChild(element('small', null, unit));
    line.appendChild(dimension);
    line.appendChild(badge(grade));
    cell.appendChild(line);
    cell.appendChild(element('span', 'gap-note', note));
    return cell;
  }

  function resultRow(item) {
    var row = element('tr');

    var identity = element('td', 'cell-identity');
    var brandLine = element('div', 'cell-brand');
    brandLine.appendChild(document.createTextNode(item.brand));
    brandLine.appendChild(classTag(item.class));
    identity.appendChild(brandLine);
    identity.appendChild(element('div', 'cell-model', item.model));
    row.appendChild(identity);

    row.appendChild(metricCell('Implant diameter', App.mm(item.diameter), 'mm Ø',
      item.diameterGrade, App.mm(item.diameterGap) + ' mm narrower than bone'));

    row.appendChild(metricCell('Implant length', App.mm(item.length), 'mm',
      item.lengthGrade,
      item.lengthGap === 0 ? 'equal to bone length' : App.mm(item.lengthGap) + ' mm shorter than bone'));

    var actions = element('td', 'cell-actions');
    if (item.catalogue) {
      var link = element('a', 'pdf-link');
      link.href = App.cataloguePath(item.catalogue);
      link.target = '_blank';
      link.rel = 'noopener';
      link.title = 'Open the ' + item.catalogue.brand + ' ' + item.catalogue.title + ' catalogue';
      link.appendChild(pdfIcon());
      link.appendChild(document.createTextNode('PDF'));
      actions.appendChild(link);
    }
    row.appendChild(actions);

    return row;
  }

  function resultTable(items) {
    var table = element('table', 'results-table');
    var head = element('thead');
    var headRow = element('tr');

    [['Brand & model', ''], ['Implant diameter', 'th-implant'],
      ['Implant length', 'th-implant'], ['', '']].forEach(function (column) {
      headRow.appendChild(element('th', column[1] || null, column[0]));
    });

    head.appendChild(headRow);
    table.appendChild(head);

    var body = element('tbody');
    items.forEach(function (item) { body.appendChild(resultRow(item)); });
    table.appendChild(body);

    var wrap = element('div', 'table-wrap');
    wrap.appendChild(table);
    return wrap;
  }

  function renderGroups(results) {
    resultsBox.innerHTML = '';

    GROUPS.forEach(function (group) {
      var items = results.filter(function (item) { return item.overall === group.key; });
      if (!items.length) return;

      var section = element('section', 'group');
      var head = element('div', 'group__head');
      head.appendChild(badge(group.key));
      head.appendChild(element('span', 'group__title', group.note));
      head.appendChild(element('span', 'group__rule'));
      head.appendChild(element('span', 'group__count',
        items.length + (items.length === 1 ? ' option' : ' options')));
      section.appendChild(head);
      section.appendChild(resultTable(items));
      resultsBox.appendChild(section);
    });
  }

  function renderPrompt() {
    countBox.textContent = 'Enter the bone measurements';
    contextBox.textContent = '';
    resultsBox.innerHTML = '';

    var notice = element('div', 'notice');
    notice.appendChild(element('h3', null, 'Waiting for the bone measurements'));
    notice.appendChild(element('p', null,
      'Type the bone diameter and the bone length measured at the implant site. ' +
      'Matching implants from the catalogue appear here immediately.'));
    var data = App.data();
    notice.appendChild(element('p', null,
      'Catalogue in use: ' + data.entryCount + ' implant sizes across ' + data.models.length + ' models.'));
    resultsBox.appendChild(notice);
  }

  function renderEmpty(boneDiameter, boneLength) {
    var windows = App.windows(boneDiameter, boneLength);
    var notice = element('div', 'notice');
    notice.appendChild(element('h3', null, 'No implant in the catalogue fits these measurements'));
    notice.appendChild(element('p', null,
      'For a bone diameter of ' + App.mm(boneDiameter) + ' mm and a bone length of ' +
      App.mm(boneLength) + ' mm, an implant has to fall inside both of these ranges:'));

    var list = element('ul');
    var diameterItem = element('li');
    diameterItem.appendChild(element('strong', null, 'Diameter: '));
    diameterItem.appendChild(document.createTextNode(
      App.mm(windows.diameter[0]) + ' mm to ' + App.mm(windows.diameter[1]) + ' mm'));
    list.appendChild(diameterItem);

    var lengthItem = element('li');
    lengthItem.appendChild(element('strong', null, 'Length: '));
    lengthItem.appendChild(document.createTextNode(
      App.mm(windows.length[0]) + ' mm to ' + App.mm(windows.length[1]) + ' mm'));
    list.appendChild(lengthItem);
    notice.appendChild(list);

    var restrictions = [];
    if (activeClasses.length) {
      restrictions.push(activeClasses.map(function (name) {
        return name === App.UNCLASSIFIED ? name : 'class ' + name;
      }).join(', '));
    }
    if (activeBrands.length) restrictions.push(activeBrands.join(', '));

    if (restrictions.length) {
      notice.appendChild(element('p', null,
        'The search is limited to ' + restrictions.join(' and ') +
        ' — clear those filters to search the whole catalogue.'));
    }

    resultsBox.innerHTML = '';
    resultsBox.appendChild(notice);
  }

  function run() {
    var boneDiameter = readNumber(diameterInput);
    var boneLength = readNumber(lengthInput);

    try {
      window.localStorage.setItem(INPUT_KEY, JSON.stringify({ d: diameterInput.value, l: lengthInput.value }));
    } catch (error) { /* ignore */ }

    if (boneDiameter === null || boneLength === null) {
      renderPrompt();
      return;
    }

    var results = App.search(boneDiameter, boneLength, { brands: activeBrands, classes: activeClasses });

    contextBox.innerHTML = '';
    contextBox.appendChild(document.createTextNode('for bone '));
    contextBox.appendChild(element('span', 'measure', App.mm(boneDiameter) + ' mm Ø'));
    contextBox.appendChild(document.createTextNode(' × '));
    contextBox.appendChild(element('span', 'measure', App.mm(boneLength) + ' mm long'));

    if (!results.length) {
      countBox.textContent = 'No matching implants';
      renderEmpty(boneDiameter, boneLength);
      return;
    }

    countBox.innerHTML = '';
    countBox.appendChild(element('strong', null, String(results.length)));
    countBox.appendChild(document.createTextNode(
      results.length === 1 ? ' matching implant' : ' matching implants'));
    renderGroups(results);
  }

  /* ----------------------------------------------------- catalogue updates */

  var dialog = document.getElementById('data-dialog');
  var statusBox = document.getElementById('data-status');
  var messageBox = document.getElementById('data-message');
  var summaryBox = document.getElementById('data-summary');
  var dropZone = document.getElementById('drop-zone');
  var fileInput = document.getElementById('file-input');

  function formatDate(iso) {
    if (!iso) return '';
    var date = new Date(iso);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function renderStatus() {
    var data = App.data();
    statusBox.innerHTML = '';

    var icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('viewBox', '0 0 24 24');
    icon.setAttribute('fill', 'none');
    icon.setAttribute('stroke', 'currentColor');
    icon.setAttribute('stroke-width', '1.8');
    icon.setAttribute('stroke-linecap', 'round');
    var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M12 8h.01M11 12h1v4h1');
    var circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', '12'); circle.setAttribute('cy', '12'); circle.setAttribute('r', '9');
    icon.appendChild(circle); icon.appendChild(path);
    statusBox.appendChild(icon);

    var text = element('div');
    text.appendChild(element('strong', null, data.entryCount + ' implant sizes'));
    text.appendChild(document.createTextNode(
      ' across ' + data.models.length + ' models. Source: ' + App.sourceName() +
      (App.isCustom() ? ' (uploaded ' + formatDate(App.importedAt()) + ')' : ' (built in)') + '.'));

    var classes = App.classes();
    text.appendChild(element('br'));
    text.appendChild(element('strong', null, classes.length + (classes.length === 1 ? ' class' : ' classes')));
    text.appendChild(document.createTextNode(
      ' (' + classes.join(', ') + '). Source: ' + App.classSourceName() +
      (App.isCustomClasses() ? ' (uploaded ' + formatDate(App.classesImportedAt()) + ')' : ' (built in)') + '.'));
    statusBox.appendChild(text);

    var updated = App.importedAt() || App.classesImportedAt();
    summaryBox.textContent = data.entryCount + ' sizes · ' + classes.length +
      (classes.length === 1 ? ' class' : ' classes') +
      (updated ? ' · updated ' + formatDate(updated) : '');
  }

  function showMessage(kind, text) {
    messageBox.innerHTML = '';
    messageBox.appendChild(element('div', 'message message--' + kind, text));
  }

  function loadFile(file) {
    if (!file) return;
    if (!/\.xlsx$/i.test(file.name)) {
      showMessage('error', 'Please choose an .xlsx file. Older .xls files can be saved as .xlsx from Excel.');
      return;
    }

    showMessage('ok', 'Reading ' + file.name + '…');

    file.arrayBuffer()
      .then(function (buffer) { return window.XlsxReader.readRows(buffer); })
      .then(function (rows) {
        var kind = App.sheetKind(rows);
        var message;

        if (kind === 'classes') {
          var classData = App.buildClassesFromRows(rows, file.name);
          App.useClasses(classData, file.name);
          message = 'Classes updated: ' + classData.rules.length +
            (classData.rules.length === 1 ? ' rule' : ' rules') + ', covering ' +
            App.classes().join(', ') + '.';
        } else if (kind === 'catalogue') {
          var data = App.buildFromRows(rows, file.name);
          App.use(data, file.name);
          message = 'Catalogue updated: ' + data.entryCount + ' implant sizes across ' +
            data.models.length + ' models.';
        } else {
          throw new Error('That sheet was not recognised. The implant catalogue needs Brand Name, ' +
            'Model, Diameter and Length columns; the class list needs Brand Name, Model and Class.');
        }

        renderStatus();
        renderFilters();
        run();
        showMessage('ok', message +
          ' This browser will keep using it until you restore the built-in data.');
      })
      .catch(function (error) {
        showMessage('error', error && error.message ? error.message : 'The file could not be read.');
      });
  }

  document.getElementById('open-data-dialog').addEventListener('click', function () {
    messageBox.innerHTML = '';
    renderStatus();
    if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
  });

  document.getElementById('close-data-dialog').addEventListener('click', function () {
    if (typeof dialog.close === 'function') dialog.close(); else dialog.removeAttribute('open');
  });

  dropZone.addEventListener('click', function () { fileInput.click(); });
  dropZone.addEventListener('keydown', function (event) {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); fileInput.click(); }
  });

  fileInput.addEventListener('change', function () {
    loadFile(fileInput.files[0]);
    fileInput.value = '';
  });

  ['dragenter', 'dragover'].forEach(function (name) {
    dropZone.addEventListener(name, function (event) {
      event.preventDefault();
      dropZone.classList.add('is-over');
    });
  });

  ['dragleave', 'drop'].forEach(function (name) {
    dropZone.addEventListener(name, function (event) {
      event.preventDefault();
      dropZone.classList.remove('is-over');
    });
  });

  dropZone.addEventListener('drop', function (event) {
    if (event.dataTransfer && event.dataTransfer.files.length) loadFile(event.dataTransfer.files[0]);
  });

  document.getElementById('reset-data').addEventListener('click', function () {
    App.reset();
    renderStatus();
    renderFilters();
    run();
    showMessage('ok', 'The built-in catalogue is in use again.');
  });

  /* Writes the data the app is using back out as the file the site loads,
     so an upload can be made permanent by replacing one file. */
  function downloadData(kind) {
    var content;
    var name;

    if (kind === 'classes') {
      name = 'classes.js';
      content = '/* Implant class data - generated from ' + App.classSourceName() + '\n' +
        '   Do not hand-edit. Update the Excel file, then use the\n' +
        '   "Update catalogue" button on the Implant Planner page.\n' +
        '   A rule with the model "All models" applies to every model of that brand. */\n' +
        'window.CLASS_DATA = ' + JSON.stringify(App.classData(), null, 2) + ';\n';
    } else {
      name = 'implants.js';
      content = '/* Implant catalogue data - generated from ' + App.sourceName() + '\n' +
        '   Do not hand-edit. Update the Excel file, then use the\n' +
        '   "Update catalogue" button on the Implant Planner page. */\n' +
        'window.IMPLANT_DATA = ' + JSON.stringify(App.data(), null, 2) + ';\n';
    }

    var url = URL.createObjectURL(new Blob([content], { type: 'text/javascript' }));
    var link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);

    showMessage('ok', 'Saved ' + name + '. Put it in the website’s data folder, replacing the old file, ' +
      'to make this the default for everyone.');
  }

  document.querySelectorAll('[data-download]').forEach(function (button) {
    button.addEventListener('click', function () {
      downloadData(button.getAttribute('data-download'));
    });
  });

  /* ------------------------------------------------------------------ init */

  App.initTheme();
  renderFilters();
  renderStatus();

  [diameterInput, lengthInput].forEach(function (input) {
    input.addEventListener('input', run);
  });

  document.querySelectorAll('[data-step]').forEach(function (button) {
    button.addEventListener('click', function () {
      var input = document.getElementById(button.getAttribute('data-step'));
      var delta = parseFloat(button.getAttribute('data-delta'));
      var value = parseFloat(input.value);
      if (isNaN(value)) value = 0;
      input.value = App.mm(Math.max(0, App.round(value + delta, 2)));
      run();
    });
  });

  document.getElementById('bone-form').addEventListener('submit', function (event) {
    event.preventDefault();
    run();
  });

  document.getElementById('clear-button').addEventListener('click', function () {
    diameterInput.value = '';
    lengthInput.value = '';
    diameterInput.focus();
    run();
  });

  try {
    var saved = JSON.parse(window.localStorage.getItem(INPUT_KEY) || 'null');
    if (saved) {
      diameterInput.value = saved.d || '';
      lengthInput.value = saved.l || '';
    }
  } catch (error) { /* ignore */ }

  run();
})();
