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
      App.mm(boneLength) + ' mm, an implant has to meet both of these:'));

    var list = element('ul');
    var diameterItem = element('li');
    diameterItem.appendChild(element('strong', null, 'Diameter: '));
    diameterItem.appendChild(document.createTextNode(
      App.mm(windows.diameterMax) + ' mm or narrower'));
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

  /* ------------------------------------------------------- data in use */

  var sourceBox = document.getElementById('data-source');

  /* One line saying which copy of the data is on screen: the Excel files
     themselves, or the copy in data/ when they cannot be read. */
  function renderSource() {
    var status = App.status();
    var data = App.data();
    var parts = [status.catalogue, status.classes];
    var failed = parts.filter(function (part) { return !part.live; });

    var summary = data.entryCount + ' implant sizes · ' + data.models.length + ' models · ' +
      App.classes().length + ' classes';

    sourceBox.innerHTML = '';
    sourceBox.className = 'data-source';
    sourceBox.appendChild(element('span', null, summary));

    if (!failed.length) {
      sourceBox.appendChild(element('span', 'data-source__file',
        'read from ' + status.catalogue.file + ' and ' + status.classes.file));
      return;
    }

    sourceBox.className = 'data-source data-source--warn';

    var offline = failed.every(function (part) {
      return part.error && part.error.message === 'OFFLINE';
    });

    sourceBox.appendChild(element('span', 'data-source__file', offline
      ? 'The spreadsheets cannot be read when the page is opened straight from disk, so this is the ' +
        'built-in copy from ' + (App.generatedOn() || 'the last update') + '. Open the site through a ' +
        'web server to read them directly.'
      : failed.map(function (part) {
          return part.file + ': ' + (part.error ? part.error.message : 'could not be read') +
            ' Showing the built-in copy from ' + (App.generatedOn() || 'the last update') + '.';
        }).join(' ')));
  }

  /* ------------------------------------------------------------------ init */

  App.initTheme();
  renderFilters();
  renderSource();

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

  /* The Excel files land a moment after the page does; take them as soon as
     they arrive and redraw with the real data. */
  App.load().then(function () {
    renderFilters();
    renderSource();
    run();
  });
})();
