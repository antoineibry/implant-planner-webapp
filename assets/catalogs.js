/* Catalogs page: one card per catalogue PDF, described with the models
   and size ranges that the current catalogue data holds for it. */
(function () {
  'use strict';

  var App = window.PerioApp;
  var grid = document.getElementById('catalogue-grid');
  var footnote = document.getElementById('catalogue-footnote');

  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function svg(paths, className) {
    var node = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    node.setAttribute('viewBox', '0 0 24 24');
    node.setAttribute('fill', 'none');
    node.setAttribute('stroke', 'currentColor');
    node.setAttribute('stroke-width', '1.5');
    node.setAttribute('stroke-linecap', 'round');
    node.setAttribute('stroke-linejoin', 'round');
    node.setAttribute('aria-hidden', 'true');
    if (className) node.setAttribute('class', className);
    paths.forEach(function (d) {
      var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', d);
      node.appendChild(path);
    });
    return node;
  }

  function documentIcon() {
    return svg([
      'M6 2.75h7.5L19 8.25v13A1.75 1.75 0 0 1 17.25 23H6a1.75 1.75 0 0 1-1.75-1.75V4.5A1.75 1.75 0 0 1 6 2.75Z',
      'M13.5 2.75v5.5H19',
      'M8 13h7',
      'M8 16.5h7',
      'M8 20h4'
    ], 'catalogue-card__icon');
  }

  function range(values) {
    var min = Math.min.apply(null, values);
    var max = Math.max.apply(null, values);
    return min === max ? App.mm(min) : App.mm(min) + '–' + App.mm(max);
  }

  function summarise(catalogue) {
    var models = [];
    var diameters = [];
    var lengths = [];
    var classes = [];
    var count = 0;

    App.data().models.forEach(function (group) {
      if (App.catalogueFor(group.brand, group.model) !== catalogue) return;
      models.push(group.model);
      if (classes.indexOf(group.class) === -1) classes.push(group.class);
      count += group.sizes.length;
      group.sizes.forEach(function (size) {
        diameters.push(size[0]);
        lengths.push(size[1]);
      });
    });

    return { models: models, count: count, diameters: diameters, lengths: lengths, classes: classes.sort() };
  }

  function card(catalogue) {
    var summary = summarise(catalogue);

    var link = element('a', 'catalogue-card');
    link.href = App.cataloguePath(catalogue);
    link.target = '_blank';
    link.rel = 'noopener';

    link.appendChild(documentIcon());

    var heading = element('div');
    var brandLine = element('div', 'catalogue-card__brand');
    brandLine.appendChild(document.createTextNode(catalogue.brand));
    summary.classes.forEach(function (name) {
      var tag = element('span', 'class-tag', name === App.UNCLASSIFIED ? name : 'Class ' + name);
      tag.title = 'Implant class';
      brandLine.appendChild(tag);
    });
    heading.appendChild(brandLine);
    heading.appendChild(element('div', 'catalogue-card__title', catalogue.title));
    link.appendChild(heading);

    var meta = element('div', 'catalogue-card__meta');
    if (summary.count) {
      meta.appendChild(element('span', null, 'Diameters ' + range(summary.diameters) + ' mm'));
      meta.appendChild(element('span', null, 'Lengths ' + range(summary.lengths) + ' mm'));
      meta.appendChild(element('span', null, summary.count + ' sizes' +
        (summary.models.length > 1 ? ' · ' + summary.models.length + ' models' : '')));
    } else {
      meta.appendChild(element('span', null, 'Not represented in the current catalogue data'));
    }
    link.appendChild(meta);

    var open = element('div', 'catalogue-card__open');
    open.appendChild(document.createTextNode('Open PDF'));
    open.appendChild(svg(['M14 4h6v6', 'M20 4 11 13',
      'M18 14.5v4A1.5 1.5 0 0 1 16.5 20h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6h4']));
    link.appendChild(open);

    return link;
  }

  App.initTheme();

  App.catalogues.forEach(function (catalogue) {
    grid.appendChild(card(catalogue));
  });

  var uncovered = [];
  App.data().models.forEach(function (group) {
    if (!App.catalogueFor(group.brand, group.model)) uncovered.push(group.brand + ' ' + group.model);
  });

  footnote.textContent = uncovered.length
    ? 'No catalogue PDF is on file for: ' + uncovered.join(', ') +
      '. Add the PDF to the Catalogues folder to make it available here.'
    : 'Every model in the current catalogue data is covered by one of these PDFs.';
})();
